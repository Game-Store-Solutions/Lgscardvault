<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\InventoryItemRepository;
use App\Service\CaseCards\SectionSerializer;
use App\Service\Spellbook\SpellbookClientInterface;

/**
 * Intersects Commander Spellbook combos with a store's in-stock Magic singles.
 */
final class StoreComboAnalyzer
{
    public function __construct(
        private readonly SpellbookClientInterface $spellbook,
        private readonly InventoryItemRepository $inventoryItems,
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
     *   combos: list<array<string, mixed>>,
     *   source: string
     * }
     */
    public function analyzeForCommander(Store $store, Card $commander, array $extraCardNames = [], int $limit = 20): array
    {
        $limit = max(1, min(40, $limit));
        $stockIndex = $this->buildStockIndex($store);
        $commanderName = $this->frontFace($commander->getName());

        $deckNames = array_values(array_unique(array_filter([
            $commanderName,
            ...array_map($this->frontFace(...), $extraCardNames),
        ])));

        $fromFind = $this->spellbook->findMyCombos($deckNames, [$commanderName]);
        $variants = [...$fromFind['included'], ...$fromFind['almostIncluded']];
        if ([] === $variants) {
            $variants = $this->spellbook->searchVariants([$commanderName], $limit);
        }

        $combos = [];
        foreach ($variants as $variant) {
            $annotated = $this->annotateVariant($variant, $stockIndex);
            if (null === $annotated) {
                continue;
            }
            $combos[] = $annotated;
            if (count($combos) >= $limit) {
                break;
            }
        }

        usort($combos, static function (array $a, array $b): int {
            $cmp = $b['inStockCount'] <=> $a['inStockCount'];
            if (0 !== $cmp) {
                return $cmp;
            }

            return $a['missingCount'] <=> $b['missingCount'];
        });

        return [
            'commander' => $commanderName,
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
     * @param array<string, mixed> $variant
     * @param array<string, InventoryItem> $stockIndex
     * @return array<string, mixed>|null
     */
    private function annotateVariant(array $variant, array $stockIndex): ?array
    {
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
            $row = [
                'name' => $name,
                'quantity' => (int) ($use['quantity'] ?? 1),
                'inStock' => $listing instanceof InventoryItem,
                'inventoryItem' => $listing instanceof InventoryItem
                    ? $this->sectionSerializer->serializeInventoryItem($listing)
                    : null,
            ];
            $cards[] = $row;
            if ($listing instanceof InventoryItem) {
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
            'inStockCount' => $inStock,
            'missingCount' => count($missing),
            'missing' => $missing,
            'completeInStore' => [] === $missing,
        ];
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
