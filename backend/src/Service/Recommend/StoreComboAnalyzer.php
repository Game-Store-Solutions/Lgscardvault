<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\CardRepository;
use App\Repository\InventoryItemRepository;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;
use App\Service\Spellbook\SpellbookClientInterface;

/**
 * Intersects Commander Spellbook combos with a store's in-stock Magic singles.
 *
 * Combos whose pieces fall outside the commander's color identity are dropped.
 * Remaining combos are ranked complete-in-store first, then by how many
 * pieces the store actually has, down to zero coverage.
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
     * Discover combos for a commander (and optional extra names), annotated
     * with which pieces are available in this store.
     *
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
        $stockIndex = $this->buildStockIndex($store);
        $commanderName = $this->frontFace($commander->getName());
        $commanderIdentity = $commander->getColorIdentity() ?? [];
        $identityCode = $this->colorIdentity->identityCode($commanderIdentity);
        $commanderKey = strtolower($commanderName);

        $deckNames = array_values(array_unique(array_filter([
            $commanderName,
            ...array_map($this->frontFace(...), $extraCardNames),
        ])));

        $fromFind = $this->spellbook->findMyCombos($deckNames, [$commanderName]);
        $variants = [...$fromFind['included'], ...$fromFind['almostIncluded']];
        if ([] === $variants) {
            $variants = $this->spellbook->searchVariants([$commanderName], 50);
        }

        $identityIndex = $this->buildIdentityIndex($variants, $stockIndex);

        $combos = [];
        $filteredOut = 0;
        foreach ($variants as $variant) {
            if (!$this->comboLegalForCommander($variant, $commanderIdentity, $identityIndex)) {
                ++$filteredOut;
                continue;
            }
            $annotated = $this->annotateVariant($variant, $stockIndex, $commanderKey, $identityIndex, $commanderIdentity);
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
     * @return array<string, InventoryItem> lowercase card name → cheapest in-stock listing
     */
    public function buildStockIndex(Store $store): array
    {
        $index = [];
        foreach ($this->inventoryItems->findInStockMagicForStore($store) as $item) {
            $card = $item->getCard();
            if (!$card instanceof Card) {
                continue;
            }
            $key = strtolower($this->frontFace($card->getName()));
            if (!isset($index[$key]) || $item->getPriceCents() < $index[$key]->getPriceCents()) {
                $index[$key] = $item;
            }
        }

        return $index;
    }

    /**
     * @param list<array<string, mixed>> $variants
     * @param array<string, InventoryItem> $stockIndex
     * @return array<string, list<string>|null> lowercase name → identity (null = unknown)
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
                $listing = $stockIndex[$key] ?? null;
                if ($listing instanceof InventoryItem) {
                    $index[$key] = $listing->getCard()?->getColorIdentity() ?? [];
                    continue;
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
     * @param array<string, InventoryItem> $stockIndex
     * @param array<string, list<string>|null> $identityIndex
     * @param list<string> $commanderIdentity
     * @return array<string, mixed>|null
     */
    private function annotateVariant(
        array $variant,
        array $stockIndex,
        string $commanderKey,
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
            $listing = $stockIndex[$key] ?? null;
            $isCommander = $key === $commanderKey;
            $available = $listing instanceof InventoryItem || $isCommander;
            $pieceIdentity = $identityIndex[$key] ?? $this->lettersFromIdentity($use['card']['identity'] ?? null);
            $row = [
                'name' => $name,
                'quantity' => (int) ($use['quantity'] ?? 1),
                'inStock' => $available,
                'isCommander' => $isCommander,
                'colorIdentity' => $pieceIdentity ?? [],
                'recommendedColors' => $commanderIdentity,
                'inventoryItem' => $listing instanceof InventoryItem
                    ? $this->sectionSerializer->serializeInventoryItem($listing)
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
     * @return list<string>|null null when identity could not be parsed
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

    private function frontFace(string $name): string
    {
        $name = trim($name);
        if (str_contains($name, ' // ')) {
            return trim(explode(' // ', $name, 2)[0]);
        }

        return $name;
    }
}
