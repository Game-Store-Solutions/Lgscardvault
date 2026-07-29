<?php

namespace App\Service\Inventory;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Enum\CardCondition;
use App\Repository\InventoryItemRepository;
use App\Service\Catalog\FinishVocabulary;
use App\Service\Notification\WantListNotifier;
use App\Service\Scryfall\ScryfallClient;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

final readonly class StoreInventoryWriter
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private InventoryItemRepository $inventoryItemRepository,
        private ScryfallClient $scryfallClient,
        private LoggerInterface $logger,
        private WantListNotifier $wantListNotifier,
    ) {
    }

    /**
     * @param string   $finish     the treatment being stocked, in the game's own
     *                             words ("Holofoil", "Cold Foil"). Callers with
     *                             only the old boolean go through
     *                             FinishVocabulary::resolveForCard() first.
     * @param int|null $priceCents explicit sell price; null falls back to the
     *                             card's market price. Games outside Magic
     *                             often have no market price at all, so the
     *                             caller's price has to win — otherwise those
     *                             listings are silently created at $0.
     */
    public function write(
        Store $store,
        Card $card,
        int $quantity,
        CardCondition $condition,
        string $finish,
        ?string $notes = null,
        bool $flush = true,
        ?int $acquisitionCostCents = null,
        ?int $priceCents = null,
    ): InventoryItem {
        // Enrich based on missing price/Scryfall data regardless of flush mode.
        // The import path calls write(flush: false); without this it would never enrich.
        // Scryfall only knows Magic: TCGCSV-sourced cards from other games must
        // never trigger a Scryfall lookup (their ids aren't Scryfall ids).
        $game = $card->getGame();
        if (null === $card->getScryfallData() && (null === $game || $game->isMtg())) {
            try {
                $this->scryfallClient->fetchCardById($card->getId());
            } catch (\Throwable $e) {
                $this->logger->warning('Scryfall enrichment failed for card {id}: {error}', [
                    'id' => (string) $card->getId(),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Batch path (flush=false): apply into the shared unit of work and let
        // the CSV handler flush + recover the whole batch on conflict (it owns
        // the transaction boundary and requeues contended rows).
        if (!$flush) {
            return $this->applyWrite($store, $card, $quantity, $condition, $finish, $notes, $acquisitionCostCents, $priceCents);
        }

        // Immediate path (flush=true, web add/edit/manual-import): a native
        // atomic upsert on the unique line. Two concurrent adds to the same
        // (store, card, condition, foil) tuple can neither 500 on the unique
        // constraint (the old check-then-insert race) nor lose an increment
        // (the old read-modify-write) — the quantity is summed in-database.
        return $this->upsertLine($store, $card, $quantity, $condition, $finish, $notes, $acquisitionCostCents, $priceCents);
    }

    /**
     * Atomic find-or-increment for the immediate write path.
     *
     * INSERT ... ON CONFLICT sums the quantity in a single statement, so it is
     * safe under concurrency without locks, an optimistic-lock retry loop, or
     * the Entity-manager-closed fallout a check-then-insert flush would cause.
     * The managed entity is then (re)loaded so callers get a hydrated
     * InventoryItem for serialization.
     */
    private function upsertLine(
        Store $store,
        Card $card,
        int $quantity,
        CardCondition $condition,
        string $finish,
        ?string $notes,
        ?int $acquisitionCostCents = null,
        ?int $priceCents = null,
    ): InventoryItem {
        $finish = $this->canonicalFinish($finish);
        $priceCents ??= $this->resolvePriceCents($card, FinishVocabulary::isFoil($finish));
        $connection = $this->entityManager->getConnection();

        $id = $connection->fetchOne(
            <<<'SQL'
            INSERT INTO inventory_items (store_id, card_id, quantity, price_cents, acquisition_cost_cents, condition, finish, notes, version)
            VALUES (:store, :card, :quantity, :price, :cost, :condition, :finish, :notes, 1)
            ON CONFLICT (store_id, card_id, condition, finish)
            DO UPDATE SET
                quantity = inventory_items.quantity + EXCLUDED.quantity,
                price_cents = EXCLUDED.price_cents,
                acquisition_cost_cents = COALESCE(EXCLUDED.acquisition_cost_cents, inventory_items.acquisition_cost_cents),
                notes = COALESCE(NULLIF(EXCLUDED.notes, ''), inventory_items.notes),
                version = inventory_items.version + 1
            RETURNING id
            SQL,
            [
                'store' => $store->getId(),
                'card' => $card->getId()->toRfc4122(),
                'quantity' => $quantity,
                'price' => $priceCents,
                'cost' => $acquisitionCostCents,
                'condition' => $condition->value,
                'finish' => $finish,
                'notes' => null !== $notes && '' !== trim($notes) ? $notes : '',
            ],
            [
                'store' => \Doctrine\DBAL\ParameterType::INTEGER,
                'quantity' => \Doctrine\DBAL\ParameterType::INTEGER,
                'price' => \Doctrine\DBAL\ParameterType::INTEGER,
                'cost' => \Doctrine\DBAL\ParameterType::INTEGER,
            ],
        );

        $item = $this->inventoryItemRepository->find((int) $id);
        if (!$item instanceof InventoryItem) {
            throw new \RuntimeException('Inventory upsert did not return a persisted row.');
        }

        // The row was written outside the ORM; refresh so a stale identity-map
        // copy reflects the committed quantity/version.
        $this->entityManager->refresh($item);

        // Cross-store want-list alerts: this card just became (or stayed)
        // available here. The native upsert path doesn't flush the unit of
        // work, so flush the persisted notifications explicitly.
        if ($item->getQuantity() > 0) {
            $this->wantListNotifier->notifyAvailability($store, $card);
            $this->entityManager->flush();
        }

        return $item;
    }

    /**
     * Finds-or-creates the inventory line and folds in the quantity/price/notes.
     * Does NOT flush — callers control the transaction boundary.
     */
    private function applyWrite(
        Store $store,
        Card $card,
        int $quantity,
        CardCondition $condition,
        string $finish,
        ?string $notes,
        ?int $acquisitionCostCents = null,
        ?int $priceCents = null,
    ): InventoryItem {
        $finish = $this->canonicalFinish($finish);
        $item = $this->inventoryItemRepository->findOneBy([
            'store' => $store,
            'card' => $card,
            'condition' => $condition,
            'finish' => $finish,
        ]);

        if (!$item instanceof InventoryItem) {
            $item = $this->findScheduledInventoryItem($store, $card, $condition, $finish);
        }

        if (!$item instanceof InventoryItem) {
            $item = new InventoryItem();
            $item->setStore($store);
            $item->setCard($card);
            $item->setCondition($condition);
            $item->applyFinish($finish);
            $item->setQuantity(0);
            $this->entityManager->persist($item);
        }

        $item->setQuantity($item->getQuantity() + $quantity);
        $item->setPriceCents($priceCents ?? $this->resolvePriceCents($card, FinishVocabulary::isFoil($finish)));
        if (null !== $acquisitionCostCents) {
            $item->setAcquisitionCostCents($acquisitionCostCents);
        }

        if (null !== $notes && '' !== trim($notes)) {
            $item->setNotes($notes);
        }

        // Batch path: notifications join the caller's unit of work and flush
        // with the batch (the CSV handler owns the transaction boundary).
        if ($item->getQuantity() > 0) {
            $this->wantListNotifier->notifyAvailability($store, $card);
        }

        return $item;
    }

    private function resolvePriceCents(Card $card, bool $isFoil): int
    {
        $prices = $card->getPrices();
        if (!is_array($prices)) {
            return 0;
        }

        $candidates = $isFoil
            ? [
                $prices['usd_foil'] ?? null,
                $prices['usd_etched'] ?? null,
                $prices['usd'] ?? null,
            ]
            : [
                $prices['usd'] ?? null,
                $prices['usd_foil'] ?? null,
            ];

        foreach ($candidates as $candidate) {
            if (!is_string($candidate) || '' === $candidate) {
                continue;
            }

            $parsed = (float) $candidate;
            if ($parsed > 0) {
                return (int) round($parsed * 100);
            }
        }

        return 0;
    }

    private function findScheduledInventoryItem(
        Store $store,
        Card $card,
        CardCondition $condition,
        string $finish,
    ): ?InventoryItem {
        $target = $this->inventoryKey($store, $card, $condition, $finish);
        if (null === $target) {
            return null;
        }

        // Build a keyed map of pending (not-yet-flushed) inventory items so repeated
        // lookups within a batch are O(1) instead of an O(n^2) nested scan.
        $pending = [];
        foreach ($this->entityManager->getUnitOfWork()->getScheduledEntityInsertions() as $entity) {
            if (!$entity instanceof InventoryItem) {
                continue;
            }

            $key = $this->inventoryKey($entity->getStore(), $entity->getCard(), $entity->getCondition(), $entity->getFinish());
            if (null !== $key && !isset($pending[$key])) {
                $pending[$key] = $entity;
            }
        }

        return $pending[$target] ?? null;
    }

    /**
     * Builds a stable composite key (store id + card id + condition + finish) used to
     * deduplicate pending inventory items. Uuid is rendered via toRfc4122() so the
     * comparison is exact/strict; returns null when identifiers are not yet available.
     */
    private function inventoryKey(?Store $store, ?Card $card, CardCondition $condition, string $finish): ?string
    {
        $storeId = $store?->getId();
        $cardId = $card?->getId();
        if (null === $storeId || null === $cardId) {
            return null;
        }

        return sprintf('%d|%s|%s|%s', $storeId, $cardId->toRfc4122(), $condition->value, $finish);
    }

    /** Never write an empty or oddly spelled treatment into the line's identity. */
    private function canonicalFinish(string $finish): string
    {
        $canonical = FinishVocabulary::canonical($finish);

        return '' !== $canonical ? $canonical : FinishVocabulary::DEFAULT_PLAIN;
    }
}
