<?php

namespace App\Service\Customer;

use App\Entity\BuylistEntry;
use App\Entity\Card;
use App\Entity\Store;
use App\Repository\BuylistEntryRepository;
use App\Repository\CardRepository;
use App\Service\Catalog\CatalogCardResolver;

/**
 * Normalize + rehydrate the per-store sell/trade draft stored on StoreCustomer.
 * Persisted shape stays slim (ids + qty); GET expands cards and buy-list offers.
 */
final class SellTradeDraftService
{
    public const MAX_LINES = 200;

    private const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

    public function __construct(
        private readonly CardRepository $cards,
        private readonly BuylistEntryRepository $buylistEntries,
        private readonly CatalogCardResolver $catalogCardResolver,
    ) {
    }

    /**
     * Validate client payload into the compact JSON we store.
     *
     * @param array<string, mixed> $payload
     *
     * @return array{payoutMethod: string, gameFilter: string, lines: list<array{cardId: string, buylistEntryId: int|null, finish: string, condition: string, quantity: int}>}|null
     *                                                                 null = clear draft
     */
    public function normalizeStored(Store $store, array $payload): ?array
    {
        $rawLines = $payload['lines'] ?? null;
        if (!\is_array($rawLines)) {
            $rawLines = [];
        }
        if (\count($rawLines) > self::MAX_LINES) {
            throw new \InvalidArgumentException(sprintf('Too many lines: maximum %d.', self::MAX_LINES));
        }

        $payoutMethod = ($payload['payoutMethod'] ?? 'credit') === 'cash' ? 'cash' : 'credit';
        $gameFilter = \is_string($payload['gameFilter'] ?? null) ? trim((string) $payload['gameFilter']) : '';
        if (\strlen($gameFilter) > 32) {
            $gameFilter = substr($gameFilter, 0, 32);
        }

        $lines = [];
        foreach ($rawLines as $raw) {
            if (!\is_array($raw)) {
                continue;
            }
            $cardId = $this->extractCardId($raw);
            if (null === $cardId) {
                continue;
            }
            $card = $this->cards->find($cardId);
            if (!$card instanceof Card) {
                continue;
            }

            $condition = strtoupper((string) ($raw['condition'] ?? 'NM'));
            if (!\in_array($condition, self::CONDITIONS, true)) {
                $condition = 'NM';
            }

            $finish = trim((string) ($raw['finish'] ?? 'Nonfoil'));
            if ('' === $finish || \strlen($finish) > 64) {
                $finish = 'Nonfoil';
            }

            $quantity = (int) ($raw['quantity'] ?? 1);
            if ($quantity < 1) {
                continue;
            }
            $quantity = min($quantity, 999);

            $entryId = $this->extractBuylistEntryId($raw);
            $entry = null;
            if (null !== $entryId) {
                $entry = $this->buylistEntries->findOneForStore($store, $entryId);
                if (!$entry instanceof BuylistEntry || !$entry->isActive()) {
                    $entry = null;
                } elseif ((string) $entry->getCard()?->getId() !== (string) $card->getId()) {
                    $entry = null;
                }
            }

            $lines[] = [
                'cardId' => (string) $card->getId(),
                'buylistEntryId' => $entry?->getId(),
                'finish' => $finish,
                'condition' => $condition,
                'quantity' => $quantity,
            ];
        }

        if ([] === $lines && 'credit' === $payoutMethod) {
            return null;
        }

        return [
            'payoutMethod' => $payoutMethod,
            'gameFilter' => $gameFilter,
            'lines' => $lines,
        ];
    }

    /**
     * Expand stored draft for the sell/trade UI.
     *
     * @param array<string, mixed>|null $stored
     *
     * @return array{payoutMethod: string, gameFilter: string, kioskCustomerName: string, lines: list<array<string, mixed>>}|null
     */
    public function hydrate(?array $stored, Store $store): ?array
    {
        if (null === $stored || [] === $stored) {
            return null;
        }

        $rawLines = $stored['lines'] ?? null;
        if (!\is_array($rawLines)) {
            $rawLines = [];
        }

        $lines = [];
        foreach ($rawLines as $raw) {
            if (!\is_array($raw)) {
                continue;
            }
            $cardId = isset($raw['cardId']) && \is_string($raw['cardId']) ? $raw['cardId'] : null;
            if (null === $cardId || '' === $cardId) {
                continue;
            }
            $card = $this->cards->find($cardId);
            if (!$card instanceof Card) {
                continue;
            }

            $condition = strtoupper((string) ($raw['condition'] ?? 'NM'));
            if (!\in_array($condition, self::CONDITIONS, true)) {
                $condition = 'NM';
            }
            $finish = trim((string) ($raw['finish'] ?? 'Nonfoil')) ?: 'Nonfoil';
            $quantity = max(1, min(999, (int) ($raw['quantity'] ?? 1)));

            $entry = null;
            $entryId = isset($raw['buylistEntryId']) ? (int) $raw['buylistEntryId'] : 0;
            if ($entryId > 0) {
                $found = $this->buylistEntries->findOneForStore($store, $entryId);
                if ($found instanceof BuylistEntry && $found->isActive() && (string) $found->getCard()?->getId() === (string) $card->getId()) {
                    $entry = $found;
                }
            }

            $lines[] = [
                'key' => null !== $entry
                    ? sprintf('entry:%d:%s', $entry->getId(), $condition)
                    : sprintf('card:%s:%s:%s', $card->getId(), $finish, $condition),
                'card' => $this->catalogCardResolver->serializeCard($card),
                'entry' => null !== $entry ? $this->serializeBuylistEntry($entry) : null,
                'finish' => $finish,
                'condition' => $condition,
                'quantity' => $quantity,
            ];
        }

        $payoutMethod = ($stored['payoutMethod'] ?? 'credit') === 'cash' ? 'cash' : 'credit';
        $gameFilter = \is_string($stored['gameFilter'] ?? null) ? (string) $stored['gameFilter'] : '';

        if ([] === $lines && 'credit' === $payoutMethod) {
            return null;
        }

        return [
            'payoutMethod' => $payoutMethod,
            'gameFilter' => $gameFilter,
            'kioskCustomerName' => '',
            'lines' => $lines,
        ];
    }

    /**
     * @param array<string, mixed> $raw
     */
    private function extractCardId(array $raw): ?string
    {
        if (isset($raw['cardId']) && \is_string($raw['cardId']) && '' !== $raw['cardId']) {
            return $raw['cardId'];
        }
        $card = $raw['card'] ?? null;
        if (\is_array($card) && isset($card['id']) && (\is_string($card['id']) || \is_int($card['id']))) {
            return (string) $card['id'];
        }

        return null;
    }

    /**
     * @param array<string, mixed> $raw
     */
    private function extractBuylistEntryId(array $raw): ?int
    {
        if (isset($raw['buylistEntryId']) && is_numeric($raw['buylistEntryId'])) {
            $id = (int) $raw['buylistEntryId'];

            return $id > 0 ? $id : null;
        }
        $entry = $raw['entry'] ?? null;
        if (\is_array($entry) && isset($entry['id']) && is_numeric($entry['id'])) {
            $id = (int) $entry['id'];

            return $id > 0 ? $id : null;
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function serializeBuylistEntry(BuylistEntry $entry): array
    {
        $card = $entry->getCard();

        return [
            'id' => $entry->getId(),
            'offerCents' => $entry->getOfferCents(),
            'wantsFinish' => $entry->getWantsFinish(),
            'wantsFoil' => $entry->wantsFoil(),
            'maxQuantity' => $entry->getMaxQuantity(),
            'active' => $entry->isActive(),
            'notes' => $entry->getNotes(),
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
            'card' => null !== $card ? $this->catalogCardResolver->serializeCard($card) : null,
        ];
    }
}
