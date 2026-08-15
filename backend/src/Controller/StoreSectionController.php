<?php

namespace App\Controller;

use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Service\Catalog\FinishVocabulary;
use App\Entity\StoreCase;
use App\Entity\StoreSection;
use App\Entity\StoreSectionCard;
use App\Enum\OrderStatus;
use App\Repository\InventoryItemRepository;
use App\Repository\OrderLineRepository;
use App\Repository\StoreCaseRepository;
use App\Repository\StoreRepository;
use App\Repository\StoreSectionCardRepository;
use App\Repository\StoreSectionRepository;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionAutoFiller;
use App\Service\CaseCards\SectionSerializer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Case sections — the labeled areas inside a store's display cases ("Black",
 * "Rares $20+"). Each section is its own trackable inventory pool: cards carry
 * an allocated quantity and a sold count, filled manually or by an auto-fill
 * whose filters cover price, rarity, set, card type, and smart color-identity
 * terms ("Azorius", "mono black", "five-color").
 *
 * The GET list is public (storefront); every mutation and the pull sheet are
 * gated on STORE_MANAGE. Case-level CRUD lives in StoreCaseController.
 */
#[Route('/api/stores/{slug}/sections')]
final class StoreSectionController extends AbstractController
{
    /** Upper bound on listings a single "Pull from inventory" click materialises. */
    private const AUTO_FILL_MAX = 60;

    /** Rarities the auto-fill filter accepts (matched case-insensitively). */
    private const ALLOWED_RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'];

    /** Order statuses whose case cards still need to be pulled from the case. */
    private const PULL_OPEN_STATUSES = [OrderStatus::PENDING, OrderStatus::RECEIVED, OrderStatus::PAID];

    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StoreCaseRepository $caseRepository,
        private readonly StoreSectionRepository $sectionRepository,
        private readonly StoreSectionCardRepository $sectionCardRepository,
        private readonly InventoryItemRepository $inventoryItemRepository,
        private readonly OrderLineRepository $orderLineRepository,
        private readonly SectionAutoFiller $autoFiller,
        private readonly SectionSerializer $serializer,
        private readonly ColorIdentityParser $colorIdentityParser,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** Public: all of a store's sections (flat). The storefront's grouped view uses GET /cases. */
    #[Route('', name: 'api_store_sections_list', methods: ['GET'])]
    public function list(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json(array_map(
            $this->serializer->serializeSection(...),
            $this->sectionRepository->findForStore($store),
        ));
    }

    #[Route('', name: 'api_store_sections_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function create(Request $request, string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $payload = $this->decodeBody($request);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        $title = trim((string) ($payload['title'] ?? ''));
        if ('' === $title) {
            return $this->json(['detail' => 'A section title is required.'], 422);
        }

        $case = $this->caseRepository->findOneForStore($store, (int) ($payload['caseId'] ?? 0));
        if (!$case instanceof StoreCase) {
            return $this->json(['detail' => 'A valid caseId is required. Create a display case first.'], 422);
        }

        $section = new StoreSection();
        $section->setStore($store);
        $section->setStoreCase($case);
        $section->setTitle(mb_substr($title, 0, 120));
        $section->setPosition($this->sectionRepository->nextPosition($store));

        $error = $this->applySettings($section, $payload);
        if (null !== $error) {
            return $this->json(['detail' => $error], 422);
        }

        $this->entityManager->persist($section);
        $this->entityManager->flush();

        return $this->json($this->serializer->serializeSection($section), 201);
    }

    #[Route('/{id}', name: 'api_store_sections_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function update(Request $request, string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $payload = $this->decodeBody($request);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('title', $payload)) {
            $title = trim((string) $payload['title']);
            if ('' === $title) {
                return $this->json(['detail' => 'A section title cannot be empty.'], 422);
            }
            $section->setTitle(mb_substr($title, 0, 120));
        }

        if (array_key_exists('caseId', $payload)) {
            $store = $section->getStore();
            $case = $store instanceof Store
                ? $this->caseRepository->findOneForStore($store, (int) $payload['caseId'])
                : null;
            if (!$case instanceof StoreCase) {
                return $this->json(['detail' => 'caseId does not reference one of this store\'s cases.'], 422);
            }
            $section->setStoreCase($case);
        }

        $error = $this->applySettings($section, $payload);
        if (null !== $error) {
            return $this->json(['detail' => $error], 422);
        }

        $this->entityManager->flush();

        return $this->json($this->serializer->serializeSection($section));
    }

    #[Route('/{id}', name: 'api_store_sections_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function delete(string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $this->entityManager->remove($section);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    /**
     * Manual fill: append the store's inventory listings to the section's
     * pool. Listings already in the section (or not belonging to this store)
     * are skipped silently, so a selection can be re-sent idempotently.
     * Optional "quantity" (default 1) sets the pool size of newly added rows.
     */
    #[Route('/{id}/items', name: 'api_store_sections_add_items', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function addItems(Request $request, string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $store = $section->getStore();
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Section is not attached to a store.'], 409);
        }

        $payload = $this->decodeBody($request);
        $ids = $this->readInventoryItemIds($payload);
        if (null === $ids) {
            return $this->json(['detail' => 'Provide inventoryItemId or a non-empty inventoryItemIds array.'], 422);
        }

        $poolQuantity = max(1, (int) (is_array($payload) ? ($payload['quantity'] ?? 1) : 1));

        $existing = $this->existingInventoryItemIds($section);
        $position = $this->sectionCardRepository->nextPosition($section);
        $limit = $section->getCardLimit();
        $added = 0;

        foreach ($ids as $itemId) {
            if (isset($existing[$itemId])) {
                continue;
            }
            if (null !== $limit && count($existing) >= $limit) {
                return $this->json(['detail' => sprintf('This section is limited to %d cards. Remove a card or raise the limit first.', $limit)], 422);
            }

            $item = $this->inventoryItemRepository->findOneByStoreAndId($store, $itemId);
            if (!$item instanceof InventoryItem) {
                continue;
            }

            $section->addCard($this->makeCard($item, $position++, $poolQuantity));
            $existing[$itemId] = true;
            ++$added;
        }

        if ($added > 0) {
            $this->entityManager->flush();
            $this->entityManager->refresh($section);
        }

        return $this->json($this->serializer->serializeSection($section));
    }

    /** Adjust a section card's pool size. Clamped to at least its sold count. */
    #[Route('/{id}/items/{cardId}', name: 'api_store_sections_update_item', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function updateItem(Request $request, string $slug, int $id, int $cardId): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $payload = $this->decodeBody($request);
        if (!is_array($payload) || !array_key_exists('quantity', $payload)) {
            return $this->json(['detail' => 'Request body must include quantity.'], 422);
        }

        foreach ($section->getCards() as $card) {
            if ($card->getId() === $cardId) {
                // Never shrink below what's already sold — history must stay consistent.
                $previous = $card->getQuantity();
                $card->setQuantity(max($card->getSoldQuantity(), (int) $payload['quantity']));
                if ($card->getQuantity() > $previous) {
                    // A top-up means more physical copies belong in the case.
                    $card->setStockedAt(null);
                }
                $this->entityManager->flush();
                break;
            }
        }

        return $this->json($this->serializer->serializeSection($section));
    }

    #[Route('/{id}/items/{cardId}', name: 'api_store_sections_remove_item', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function removeItem(string $slug, int $id, int $cardId): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        foreach ($section->getCards() as $card) {
            if ($card->getId() === $cardId) {
                $section->removeCard($card);
                $this->entityManager->flush();
                break;
            }
        }

        $this->entityManager->refresh($section);

        return $this->json($this->serializer->serializeSection($section));
    }

    /**
     * Auto fill — the "Pull from inventory" button. Picks up to AUTO_FILL_MAX
     * listings matching the section's filters (price, rarity, set, type, color
     * identity), skipping stock already claimed by the store's other sections,
     * and merges them into the pool:
     *
     *  - matching listings already in the section keep their pool counts;
     *  - new matches are added with one allocated copy (one display slot);
     *  - stale rows with sales are kept but frozen (pool = sold) so pending
     *    pull sheets and history stay intact;
     *  - stale rows with no sales are removed.
     */
    #[Route('/{id}/auto-fill', name: 'api_store_sections_auto_fill', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function autoFill(Request $request, string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $payload = $this->decodeBody($request);
        if (is_array($payload) && [] !== $payload) {
            // Let the same request that clicks "Pull" also save the criteria.
            $section->setMode(StoreSection::MODE_AUTO);
            $error = $this->applySettings($section, $payload + ['mode' => StoreSection::MODE_AUTO]);
            if (null !== $error) {
                return $this->json(['detail' => $error], 422);
            }
        }

        $min = $section->getAutoMinPriceCents();
        $max = $section->getAutoMaxPriceCents();
        if (null !== $min && null !== $max && $min > $max) {
            return $this->json(['detail' => 'Minimum price cannot exceed maximum price.'], 422);
        }

        // The section's own capacity wins over the platform ceiling, so a
        // 12-slot case area pulls exactly 12 cards.
        $picked = $this->autoFiller->pickListings($section, min($section->getCardLimit() ?? self::AUTO_FILL_MAX, self::AUTO_FILL_MAX));

        /** @var array<int, StoreSectionCard> $existingByItem */
        $existingByItem = [];
        foreach ($section->getCards() as $card) {
            $itemId = $card->getInventoryItem()?->getId();
            if (null !== $itemId) {
                $existingByItem[$itemId] = $card;
            }
        }

        $position = 0;
        $keptItemIds = [];
        foreach ($picked as $item) {
            $itemId = (int) $item->getId();
            $keptItemIds[$itemId] = true;
            if (isset($existingByItem[$itemId])) {
                $existingByItem[$itemId]->setPosition($position++);
            } else {
                $section->addCard($this->makeCard($item, $position++, 1));
            }
        }

        foreach ($existingByItem as $itemId => $card) {
            if (isset($keptItemIds[$itemId])) {
                continue;
            }
            if ($card->getSoldQuantity() > 0) {
                // Sold-from rows stay for pull sheets/history but stop selling.
                $card->setQuantity($card->getSoldQuantity());
                $card->setPosition($position++);
            } else {
                $section->removeCard($card);
            }
        }

        $this->entityManager->flush();
        $this->entityManager->refresh($section);

        return $this->json($this->serializer->serializeSection($section));
    }

    /**
     * Pull sheet: every case card in open orders (placed but not yet
     * fulfilled/shipped/cancelled) that staff must pull from this section.
     * Reflects the live order lifecycle — fulfilling, cancelling, or
     * refunding an order drops its lines off the sheet.
     */
    #[Route('/{id}/pull-sheet', name: 'api_store_sections_pull_sheet', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function pullSheet(string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $lines = $this->orderLineRepository->findOpenPullLinesForSection($section, self::PULL_OPEN_STATUSES);

        $rows = [];
        $totalCards = 0;
        foreach ($lines as $line) {
            $order = $line->getParentOrder();
            $card = $line->getCard();
            $totalCards += $line->getCaseQuantity();
            $rows[] = [
                'lineId' => $line->getId(),
                'cardName' => $line->getCardName(),
                'setCode' => $card?->getSetCode(),
                'collectorNumber' => $card?->getCollectorNumber(),
                'quantity' => $line->getCaseQuantity(),
                'orderReference' => $order?->getReference(),
                'orderStatus' => $order?->getStatus()->value,
                'customerName' => $order?->getCustomerName(),
                'customerEmail' => $order?->getCustomerEmail(),
                'orderedAt' => $order?->getCreatedAt()->format(DATE_ATOM),
            ];
        }

        return $this->json([
            'caseName' => $section->getStoreCase()?->getName(),
            'sectionTitle' => $section->getTitle(),
            'generatedAt' => (new \DateTimeImmutable())->format(DATE_ATOM),
            'totalCards' => $totalCards,
            'rows' => $rows,
        ]);
    }

    /**
     * Stocking sheet: every card added (or topped up) to this section's pool
     * that staff have not yet physically placed in the display case. This is
     * the restock counterpart of the pull sheet — pull answers "what leaves
     * the case for orders", stocking answers "what goes INTO the case after
     * a backfill".
     */
    #[Route('/{id}/stocking-sheet', name: 'api_store_sections_stocking_sheet', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function stockingSheet(string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $rows = [];
        $totalCards = 0;
        foreach ($section->getCards() as $sectionCard) {
            if (!$sectionCard->needsStocking()) {
                continue;
            }

            $item = $sectionCard->getInventoryItem();
            $card = $item?->getCard();
            $copies = $sectionCard->remaining();
            $totalCards += $copies;
            $rows[] = [
                'sectionCardId' => $sectionCard->getId(),
                'cardName' => $card?->getName() ?? 'Unknown card',
                'setCode' => $card?->getSetCode(),
                'collectorNumber' => $card?->getCollectorNumber(),
                'condition' => $item?->getCondition()->value,
                'finish' => $item?->getFinish() ?? FinishVocabulary::DEFAULT_PLAIN,
                'isFoil' => $item?->isFoil() ?? false,
                'priceCents' => $item?->getPriceCents(),
                'copies' => $copies,
            ];
        }

        return $this->json([
            'caseName' => $section->getStoreCase()?->getName(),
            'sectionTitle' => $section->getTitle(),
            'generatedAt' => (new \DateTimeImmutable())->format(DATE_ATOM),
            'totalCards' => $totalCards,
            'rows' => $rows,
        ]);
    }

    /**
     * Confirm cards are physically in the case. Body may carry
     * {"cardIds": [...]} (section-card ids) to confirm a subset; an empty or
     * absent list confirms every row currently needing stocking.
     */
    #[Route('/{id}/stocking-sheet/mark-stocked', name: 'api_store_sections_mark_stocked', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function markStocked(Request $request, string $slug, int $id): JsonResponse
    {
        $section = $this->findManagedSection($slug, $id);
        if (!$section instanceof StoreSection) {
            return $this->json(['detail' => 'Section not found.'], 404);
        }

        $payload = $this->decodeBody($request);
        $onlyIds = null;
        if (is_array($payload) && isset($payload['cardIds']) && is_array($payload['cardIds']) && [] !== $payload['cardIds']) {
            $onlyIds = array_flip(array_map(intval(...), $payload['cardIds']));
        }

        $now = new \DateTimeImmutable();
        $marked = 0;
        foreach ($section->getCards() as $card) {
            if (null !== $card->getStockedAt()) {
                continue;
            }
            if (null !== $onlyIds && !isset($onlyIds[(int) $card->getId()])) {
                continue;
            }
            $card->setStockedAt($now);
            ++$marked;
        }

        if ($marked > 0) {
            $this->entityManager->flush();
        }

        return $this->json($this->serializer->serializeSection($section));
    }

    /**
     * Apply the settable fields common to create/update/auto-fill: mode and
     * the auto-fill criteria. Returns an error string on invalid input, null
     * on success. Only keys present in the payload are touched.
     */
    private function applySettings(StoreSection $section, array $payload): ?string
    {
        if (array_key_exists('mode', $payload)) {
            $mode = (string) $payload['mode'];
            if (!in_array($mode, [StoreSection::MODE_MANUAL, StoreSection::MODE_AUTO], true)) {
                return 'Mode must be "manual" or "auto".';
            }
            $section->setMode($mode);
        }

        if (array_key_exists('autoMinPriceCents', $payload)) {
            $min = $this->readNullableNonNegativeInt($payload['autoMinPriceCents']);
            if (false === $min) {
                return 'autoMinPriceCents must be a non-negative integer or null.';
            }
            $section->setAutoMinPriceCents($min);
        }

        if (array_key_exists('autoMaxPriceCents', $payload)) {
            $max = $this->readNullableNonNegativeInt($payload['autoMaxPriceCents']);
            if (false === $max) {
                return 'autoMaxPriceCents must be a non-negative integer or null.';
            }
            $section->setAutoMaxPriceCents($max);
        }

        if (array_key_exists('autoRarity', $payload)) {
            $raw = $payload['autoRarity'];
            if (null === $raw || '' === $raw) {
                $section->setAutoRarity(null);
            } else {
                $rarity = strtolower(trim((string) $raw));
                if (!in_array($rarity, self::ALLOWED_RARITIES, true)) {
                    return 'autoRarity must be one of: '.implode(', ', self::ALLOWED_RARITIES).'.';
                }
                $section->setAutoRarity($rarity);
            }
        }

        if (array_key_exists('autoColorIdentity', $payload)) {
            $raw = $payload['autoColorIdentity'];
            if (null === $raw || '' === trim((string) $raw)) {
                $section->setAutoColorIdentity(null);
            } else {
                $code = $this->colorIdentityParser->parse((string) $raw);
                if (null === $code) {
                    return sprintf(
                        'Unrecognized color filter "%s". Try a color (Black), a guild/shard/wedge (Azorius, Esper, Abzan), letters (UB, WUBRG), Colorless, Multicolor, or Five-Color.',
                        trim((string) $raw),
                    );
                }
                $section->setAutoColorIdentity($code);
            }
        }

        if (array_key_exists('autoSetCode', $payload)) {
            $raw = strtolower(trim((string) ($payload['autoSetCode'] ?? '')));
            if ('' === $raw) {
                $section->setAutoSetCode(null);
            } elseif (1 !== preg_match('/^[a-z0-9]{2,10}$/', $raw)) {
                return 'autoSetCode must be a set code like "neo" or "mh2".';
            } else {
                $section->setAutoSetCode($raw);
            }
        }

        if (array_key_exists('autoCardType', $payload)) {
            $raw = trim((string) ($payload['autoCardType'] ?? ''));
            $section->setAutoCardType('' === $raw ? null : mb_substr($raw, 0, 40));
        }

        if (array_key_exists('cardLimit', $payload)) {
            $limit = $this->readNullableNonNegativeInt($payload['cardLimit']);
            if (false === $limit || 0 === $limit || (null !== $limit && $limit > self::AUTO_FILL_MAX)) {
                return sprintf('cardLimit must be between 1 and %d, or null for the default.', self::AUTO_FILL_MAX);
            }
            $section->setCardLimit($limit);
        }

        return null;
    }

    /**
     * @return list<int>|null null when the payload carries no usable id(s)
     */
    private function readInventoryItemIds(mixed $payload): ?array
    {
        if (!is_array($payload)) {
            return null;
        }

        $raw = [];
        if (array_key_exists('inventoryItemId', $payload)) {
            $raw[] = $payload['inventoryItemId'];
        }
        if (isset($payload['inventoryItemIds']) && is_array($payload['inventoryItemIds'])) {
            $raw = array_merge($raw, $payload['inventoryItemIds']);
        }

        $ids = [];
        foreach ($raw as $value) {
            if (is_int($value) || (is_string($value) && ctype_digit($value))) {
                $id = (int) $value;
                if ($id > 0) {
                    $ids[$id] = true;
                }
            }
        }

        return [] === $ids ? null : array_keys($ids);
    }

    /**
     * @return int|null|false false = invalid; int/null = the parsed value
     */
    private function readNullableNonNegativeInt(mixed $value): int|null|false
    {
        if (null === $value || '' === $value) {
            return null;
        }
        if (is_int($value) && $value >= 0) {
            return $value;
        }
        if (is_string($value) && ctype_digit($value)) {
            return (int) $value;
        }

        return false;
    }

    /** @return array<int, true> inventory item ids already placed in the section */
    private function existingInventoryItemIds(StoreSection $section): array
    {
        $ids = [];
        foreach ($section->getCards() as $card) {
            $item = $card->getInventoryItem();
            if ($item instanceof InventoryItem && null !== $item->getId()) {
                $ids[$item->getId()] = true;
            }
        }

        return $ids;
    }

    private function makeCard(InventoryItem $item, int $position, int $poolQuantity): StoreSectionCard
    {
        $card = new StoreSectionCard();
        $card->setInventoryItem($item);
        $card->setPosition($position);
        $card->setQuantity($poolQuantity);

        return $card;
    }

    private function findManagedStore(string $slug): ?Store
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $store;
    }

    private function findManagedSection(string $slug, int $id): ?StoreSection
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return null;
        }

        return $this->sectionRepository->findOneForStore($store, $id);
    }

    private function decodeBody(Request $request): mixed
    {
        $content = $request->getContent();
        if ('' === $content) {
            return [];
        }

        return json_decode($content, true);
    }
}
