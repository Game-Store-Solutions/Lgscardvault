<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\CardRepository;
use App\Repository\InventoryItemRepository;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;
use App\Service\Catalog\SearchTextNormalizer;
use App\Service\Spellbook\SpellbookClientInterface;

/**
 * Intersects Commander Spellbook combos with a store's in-stock Magic singles.
 *
 * Stock coverage is strict: a piece counts only when this store has enough
 * quantity on hand (any printing of the same oracle card). The commander is
 * never assumed "in stock" unless it appears in inventory.
 */
final class StoreComboAnalyzer
{
    public function __construct(
        private readonly SpellbookClientInterface $spellbook,
        private readonly InventoryItemRepository $inventoryItems,
        private readonly CardRepository $cards,
        private readonly ColorIdentityParser $colorIdentity,
        private readonly SectionSerializer $sectionSerializer,
    ) {
    }

    /**
     * @param list<string> $extraCardNames
     * @return array{
     *   commander: string,
     *   colorIdentity: list<string>,
     *   identityCode: string,
     *   legalColors: list<string>,
     *   filteredOutCount: int,
     *   combos: list<array<string, mixed>>,
     *   source: string
     * }
     */
    public function analyzeForCommander(Store $store, Card $commander, array $extraCardNames = [], int $limit = 20): array
    {
        $limit = max(1, min(40, $limit));
        $commanderName = $this->frontFace($commander->getName());
        $commanderIdentity = $commander->getColorIdentity() ?? [];
        $identityCode = $this->colorIdentity->identityCode($commanderIdentity);
        $commanderKey = strtolower($commanderName);
        $commanderOracle = strtolower((string) $commander->getOracleId());

        $deckNames = array_values(array_unique(array_filter([
            $commanderName,
            ...array_map($this->frontFace(...), $extraCardNames),
        ])));

        $fromFind = $this->spellbook->findMyCombos($deckNames, [$commanderName]);
        $variants = [...$fromFind['included'], ...$fromFind['almostIncluded']];
        if ([] === $variants) {
            $variants = $this->spellbook->searchVariants([$commanderName], 50);
        }

        $stockIndex = $this->buildStockIndexForComboPieces($store, $variants, $deckNames);
        $identityIndex = $this->buildIdentityIndex($variants, $stockIndex);
        $catalogOracleByName = $this->buildCatalogOracleIndex($variants, $stockIndex);

        $combos = [];
        $filteredOut = 0;
        foreach ($variants as $variant) {
            if (!$this->comboLegalForCommander($variant, $commanderIdentity, $identityIndex)) {
                ++$filteredOut;
                continue;
            }
            $annotated = $this->annotateVariant(
                $variant,
                $stockIndex,
                $catalogOracleByName,
                $commanderKey,
                $commanderOracle,
                $identityIndex,
                $commanderIdentity,
            );
            if (null === $annotated) {
                continue;
            }
            $combos[] = $annotated;
        }

        usort($combos, static function (array $a, array $b): int {
            $cmp = ((int) $b['completeInStore']) <=> ((int) $a['completeInStore']);
            if (0 !== $cmp) {
                return $cmp;
            }
            $cmp = $b['inStockCount'] <=> $a['inStockCount'];
            if (0 !== $cmp) {
                return $cmp;
            }
            $aRatio = ($a['pieceCount'] ?? 0) > 0 ? $a['inStockCount'] / $a['pieceCount'] : 0;
            $bRatio = ($b['pieceCount'] ?? 0) > 0 ? $b['inStockCount'] / $b['pieceCount'] : 0;
            $cmp = $bRatio <=> $aRatio;
            if (0 !== $cmp) {
                return $cmp;
            }

            return $a['missingCount'] <=> $b['missingCount'];
        });

        return [
            'commander' => $commanderName,
            'colorIdentity' => $commanderIdentity,
            'identityCode' => $identityCode,
            'legalColors' => $commanderIdentity,
            'filteredOutCount' => $filteredOut,
            'combos' => array_slice($combos, 0, $limit),
            'source' => 'commander-spellbook',
        ];
    }

    /**
     * Build a stock index scoped to combo pieces only — uses the same direct
     * name / oracle lookups as mass search instead of a capped full-store scan.
     *
     * @param list<array<string, mixed>> $variants
     * @param list<string> $extraNames
     * @return array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * }
     */
    private function buildStockIndexForComboPieces(Store $store, array $variants, array $extraNames): array
    {
        $names = [];
        $oracles = [];

        foreach ($extraNames as $name) {
            $front = $this->frontFace($name);
            if ('' !== $front) {
                $names[strtolower($front)] = true;
            }
        }

        foreach ($variants as $variant) {
            $uses = is_array($variant['uses'] ?? null) ? $variant['uses'] : [];
            foreach ($uses as $use) {
                $card = is_array($use['card'] ?? null) ? $use['card'] : [];
                $front = $this->frontFace((string) ($card['name'] ?? ''));
                if ('' !== $front) {
                    $names[strtolower($front)] = true;
                }
                foreach (['oracleId', 'oracle_id', 'scryfallOracleId'] as $field) {
                    $raw = $card[$field] ?? null;
                    if (is_string($raw) && '' !== trim($raw)) {
                        $oracles[strtolower(trim($raw))] = true;
                    }
                }
            }
        }

        $byOracle = [];
        $byName = [];
        $byNormalized = [];

        if ([] !== $names) {
            foreach ($this->inventoryItems->findInStockByCardNames($store, array_keys($names)) as $item) {
                $this->accumulateStockItem($item, $byOracle, $byName, $byNormalized);
            }
        }

        if ([] !== $oracles) {
            foreach ($this->inventoryItems->findInStockByOracleIds($store, array_keys($oracles)) as $item) {
                $this->accumulateStockItem($item, $byOracle, $byName, $byNormalized);
            }
        }

        return [
            'byOracle' => $byOracle,
            'byName' => $byName,
            'byNormalized' => $byNormalized,
        ];
    }

    /**
     * @param array<string, array{listing: InventoryItem, quantity: int}> $byOracle
     * @param array<string, string> $byName
     * @param array<string, string> $byNormalized
     */
    private function accumulateStockItem(
        InventoryItem $item,
        array &$byOracle,
        array &$byName,
        array &$byNormalized,
    ): void {
        $card = $item->getCard();
        if (!$card instanceof Card) {
            return;
        }

        $oracleKey = strtolower((string) $card->getOracleId());
        $qty = $item->getQuantity();
        if (!isset($byOracle[$oracleKey])) {
            $byOracle[$oracleKey] = ['listing' => $item, 'quantity' => $qty];
        } else {
            $byOracle[$oracleKey]['quantity'] += $qty;
            if ($item->getPriceCents() < $byOracle[$oracleKey]['listing']->getPriceCents()) {
                $byOracle[$oracleKey]['listing'] = $item;
            }
        }

        $nameKey = strtolower($this->frontFace($card->getName()));
        $byName[$nameKey] = $oracleKey;
        $byNormalized[$this->normalizeComboName($card->getName())] = $oracleKey;
    }

    /**
     * @return array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * }
     */
    public function buildStockIndex(Store $store): array
    {
        $byOracle = [];
        $byName = [];
        $byNormalized = [];

        foreach ($this->inventoryItems->findInStockMagicForStore($store) as $item) {
            $this->accumulateStockItem($item, $byOracle, $byName, $byNormalized);
        }

        return [
            'byOracle' => $byOracle,
            'byName' => $byName,
            'byNormalized' => $byNormalized,
        ];
    }

    /**
     * @param list<array<string, mixed>> $variants
     * @param array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * } $stockIndex
     * @return array<string, string> lowercase spellbook name → oracle id
     */
    private function buildCatalogOracleIndex(array $variants, array $stockIndex): array
    {
        $needLookup = [];
        foreach ($variants as $variant) {
            $uses = is_array($variant['uses'] ?? null) ? $variant['uses'] : [];
            foreach ($uses as $use) {
                $name = (string) ($use['card']['name'] ?? '');
                if ('' === $name) {
                    continue;
                }
                $key = strtolower($this->frontFace($name));
                if (null !== $this->resolveOracleKey($use, $key, $stockIndex, [])) {
                    continue;
                }
                $needLookup[$key] = $key;
            }
        }

        $catalog = [];
        if ([] !== $needLookup) {
            $catalog = $this->cards->mapOracleIdByLowerNames($needLookup);
        }

        return $catalog;
    }

    /**
     * @param list<array<string, mixed>> $variants
     * @param array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * } $stockIndex
     * @return array<string, list<string>|null>
     */
    private function buildIdentityIndex(array $variants, array $stockIndex): array
    {
        $index = [];
        $needLookup = [];
        foreach ($variants as $variant) {
            $uses = is_array($variant['uses'] ?? null) ? $variant['uses'] : [];
            foreach ($uses as $use) {
                $name = (string) ($use['card']['name'] ?? '');
                if ('' === $name) {
                    continue;
                }
                $key = strtolower($this->frontFace($name));
                if (isset($index[$key])) {
                    continue;
                }
                $fromSpellbook = $this->lettersFromIdentity($use['card']['identity'] ?? $use['card']['colorIdentity'] ?? null);
                if (null !== $fromSpellbook) {
                    $index[$key] = $fromSpellbook;
                    continue;
                }
                $oracleKey = $this->resolveOracleKey($use, $key, $stockIndex, []);
                if (null !== $oracleKey) {
                    $listing = $stockIndex['byOracle'][$oracleKey]['listing'] ?? null;
                    if ($listing instanceof InventoryItem) {
                        $index[$key] = $listing->getCard()?->getColorIdentity() ?? [];
                        continue;
                    }
                }
                $needLookup[] = $key;
            }
        }

        if ([] !== $needLookup) {
            foreach ($this->cards->mapColorIdentityByLowerNames($needLookup) as $name => $identity) {
                if (!isset($index[$name])) {
                    $index[$name] = $identity;
                }
            }
        }

        return $index;
    }

    /**
     * @param array<string, mixed> $variant
     * @param list<string> $commanderIdentity
     * @param array<string, list<string>|null> $identityIndex
     */
    private function comboLegalForCommander(array $variant, array $commanderIdentity, array $identityIndex): bool
    {
        $variantLetters = $this->lettersFromIdentity($variant['identity'] ?? $variant['colorIdentity'] ?? null);
        if (null !== $variantLetters && !$this->colorIdentity->isSubsetOf($commanderIdentity, $variantLetters)) {
            return false;
        }

        $uses = is_array($variant['uses'] ?? null) ? $variant['uses'] : [];
        foreach ($uses as $use) {
            $name = (string) ($use['card']['name'] ?? '');
            if ('' === $name) {
                continue;
            }
            $key = strtolower($this->frontFace($name));
            $pieceIdentity = $identityIndex[$key] ?? $this->lettersFromIdentity($use['card']['identity'] ?? null);
            if (null === $pieceIdentity) {
                continue;
            }
            if (!$this->colorIdentity->isSubsetOf($commanderIdentity, $pieceIdentity)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param array<string, mixed> $variant
     * @param array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * } $stockIndex
     * @param array<string, string> $catalogOracleByName
     * @param array<string, list<string>|null> $identityIndex
     * @param list<string> $commanderIdentity
     * @return array<string, mixed>|null
     */
    private function annotateVariant(
        array $variant,
        array $stockIndex,
        array $catalogOracleByName,
        string $commanderKey,
        string $commanderOracle,
        array $identityIndex,
        array $commanderIdentity,
    ): ?array {
        $uses = is_array($variant['uses'] ?? null) ? $variant['uses'] : [];
        if ([] === $uses) {
            return null;
        }

        $cards = [];
        $inStock = 0;
        $missing = [];
        foreach ($uses as $use) {
            $name = (string) ($use['card']['name'] ?? '');
            if ('' === $name) {
                continue;
            }
            $key = strtolower($this->frontFace($name));
            $requiredQty = max(1, (int) ($use['quantity'] ?? 1));
            $stock = $this->resolveStockEntry($use, $key, $stockIndex, $catalogOracleByName, $requiredQty);
            $isCommander = $key === $commanderKey
                || ($stock['oracleKey'] ?? '') === $commanderOracle;
            $pieceIdentity = $identityIndex[$key] ?? $this->lettersFromIdentity($use['card']['identity'] ?? null);
            $available = $stock['available'];
            $row = [
                'name' => $name,
                'quantity' => $requiredQty,
                'inStock' => $available,
                'isCommander' => $isCommander,
                'stockQuantity' => $stock['quantity'],
                'colorIdentity' => $pieceIdentity ?? [],
                'recommendedColors' => $commanderIdentity,
                'inventoryItem' => $available && $stock['listing'] instanceof InventoryItem
                    ? $this->sectionSerializer->serializeInventoryItem($stock['listing'])
                    : null,
            ];
            $cards[] = $row;
            if ($available) {
                ++$inStock;
            } else {
                $missing[] = $name;
            }
        }

        if ([] === $cards) {
            return null;
        }

        $produces = [];
        foreach ($variant['produces'] ?? [] as $produce) {
            $feature = $produce['feature']['name'] ?? $produce['name'] ?? null;
            if (null !== $feature && '' !== (string) $feature) {
                $produces[] = (string) $feature;
            }
        }

        return [
            'id' => (string) ($variant['id'] ?? ''),
            'description' => (string) ($variant['description'] ?? ''),
            'status' => (string) ($variant['status'] ?? 'OK'),
            'produces' => $produces,
            'cards' => $cards,
            'pieceCount' => count($cards),
            'inStockCount' => $inStock,
            'missingCount' => count($missing),
            'missing' => $missing,
            'completeInStore' => [] === $missing,
            'coverage' => count($cards) > 0 ? round($inStock / count($cards), 3) : 0,
        ];
    }

    /**
     * @param array<string, mixed> $use
     * @param array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * } $stockIndex
     * @param array<string, string> $catalogOracleByName
     * @return array{
     *   available: bool,
     *   quantity: int,
     *   listing: InventoryItem|null,
     *   oracleKey: string|null
     * }
     */
    private function resolveStockEntry(
        array $use,
        string $nameKey,
        array $stockIndex,
        array $catalogOracleByName,
        int $requiredQty,
    ): array {
        $oracleKey = $this->resolveOracleKey($use, $nameKey, $stockIndex, $catalogOracleByName);
        if (null === $oracleKey) {
            return ['available' => false, 'quantity' => 0, 'listing' => null, 'oracleKey' => null];
        }

        $entry = $stockIndex['byOracle'][$oracleKey] ?? null;
        if (!is_array($entry)) {
            return ['available' => false, 'quantity' => 0, 'listing' => null, 'oracleKey' => $oracleKey];
        }

        $quantity = (int) ($entry['quantity'] ?? 0);
        $listing = $entry['listing'] ?? null;

        return [
            'available' => $quantity >= $requiredQty && $listing instanceof InventoryItem,
            'quantity' => $quantity,
            'listing' => $listing instanceof InventoryItem ? $listing : null,
            'oracleKey' => $oracleKey,
        ];
    }

    /**
     * @param array<string, mixed> $use
     * @param array{
     *   byOracle: array<string, array{listing: InventoryItem, quantity: int}>,
     *   byName: array<string, string>,
     *   byNormalized: array<string, string>
     * } $stockIndex
     * @param array<string, string> $catalogOracleByName
     */
    private function resolveOracleKey(
        array $use,
        string $nameKey,
        array $stockIndex,
        array $catalogOracleByName,
    ): ?string {
        $card = is_array($use['card'] ?? null) ? $use['card'] : [];

        if (isset($stockIndex['byName'][$nameKey])) {
            return $stockIndex['byName'][$nameKey];
        }

        $normalized = $this->normalizeComboName((string) ($card['name'] ?? ''));
        if ('' !== $normalized && isset($stockIndex['byNormalized'][$normalized])) {
            return $stockIndex['byNormalized'][$normalized];
        }

        foreach (['oracleId', 'oracle_id', 'scryfallOracleId'] as $field) {
            $raw = $card[$field] ?? null;
            if (is_string($raw) && '' !== trim($raw)) {
                $key = strtolower(trim($raw));
                if (isset($stockIndex['byOracle'][$key])) {
                    return $key;
                }
            }
        }

        if (isset($catalogOracleByName[$nameKey])) {
            $key = $catalogOracleByName[$nameKey];
            if (isset($stockIndex['byOracle'][$key])) {
                return $key;
            }
        }

        return null;
    }

    /**
     * @return list<string>|null
     */
    private function lettersFromIdentity(mixed $raw): ?array
    {
        if (null === $raw || '' === $raw || false === $raw) {
            return null;
        }
        if (is_array($raw)) {
            $letters = [];
            foreach ($raw as $letter) {
                if (is_string($letter) && '' !== $letter) {
                    $letters[] = strtoupper($letter);
                }
            }

            return $letters;
        }
        if (!is_string($raw)) {
            return null;
        }
        $upper = strtoupper(trim($raw));
        if ('C' === $upper || 'COLORLESS' === $upper) {
            return [];
        }
        $filtered = preg_replace('/[^WUBRG]/', '', $upper) ?? '';
        if ('' === $filtered) {
            return null;
        }

        return array_values(array_unique(str_split($filtered)));
    }

    private function normalizeComboName(string $name): string
    {
        return str_replace(['.', ' ', '-', ','], '', SearchTextNormalizer::fold($this->frontFace($name)));
    }

    private function frontFace(string $name): string
    {
        $name = trim($name);
        if (str_contains($name, ' // ')) {
            return trim(explode(' // ', $name, 2)[0]);
        }

        return $name;
    }
}
