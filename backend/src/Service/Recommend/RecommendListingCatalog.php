<?php

namespace App\Service\Recommend;

use App\Entity\Store;
use App\Service\CaseCards\SectionSerializer;
use App\Repository\InventoryItemRepository;

/**
 * In-stock printings keyed by oracle id for deck-builder lightboxes.
 */
final class RecommendListingCatalog
{
    public function __construct(
        private readonly InventoryItemRepository $inventoryItems,
        private readonly SectionSerializer $sectionSerializer,
    ) {
    }

    /**
     * @param list<string> $oracleIds
     *
     * @return array<string, list<array<string, mixed>>>
     */
    public function optionsByOracle(?Store $store, array $oracleIds): array
    {
        if (!$store instanceof Store) {
            return [];
        }

        $normalized = [];
        foreach ($oracleIds as $oracleId) {
            $key = strtolower(trim((string) $oracleId));
            if ('' !== $key) {
                $normalized[$key] = $key;
            }
        }
        if ([] === $normalized) {
            return [];
        }

        $grouped = [];
        foreach ($this->inventoryItems->findInStockByOracleIds($store, array_values($normalized)) as $item) {
            $card = $item->getCard();
            if (null === $card) {
                continue;
            }
            $key = strtolower((string) $card->getOracleId());
            $grouped[$key][] = $this->sectionSerializer->serializeInventoryItem($item);
        }

        foreach ($grouped as &$options) {
            usort($options, static fn (array $a, array $b): int => ($a['priceCents'] ?? 0) <=> ($b['priceCents'] ?? 0));
        }

        return $grouped;
    }

    /**
     * @param list<array<string, mixed>> $rows rows with card.oracleId
     */
    public function attachInventoryOptions(?Store $store, array &$rows): void
    {
        if (!$store instanceof Store || [] === $rows) {
            return;
        }

        $oracleIds = [];
        foreach ($rows as $row) {
            $oracleIds[] = (string) ($row['card']['oracleId'] ?? '');
        }

        $optionsByOracle = $this->optionsByOracle($store, $oracleIds);
        foreach ($rows as &$row) {
            $key = strtolower((string) ($row['card']['oracleId'] ?? ''));
            $row['inventoryOptions'] = $optionsByOracle[$key] ?? [];
        }
        unset($row);
    }

    /**
     * @param list<array<string, mixed>> $combos
     */
    public function attachComboInventoryOptions(?Store $store, array &$combos): void
    {
        if (!$store instanceof Store || [] === $combos) {
            return;
        }

        $oracleIds = [];
        foreach ($combos as $combo) {
            foreach (is_array($combo['cards'] ?? null) ? $combo['cards'] : [] as $piece) {
                $oracleIds[] = (string) ($piece['oracleId'] ?? $piece['inventoryItem']['card']['oracleId'] ?? '');
            }
        }

        $optionsByOracle = $this->optionsByOracle($store, $oracleIds);
        foreach ($combos as &$combo) {
            $cards = is_array($combo['cards'] ?? null) ? $combo['cards'] : [];
            foreach ($cards as &$piece) {
                $key = strtolower((string) ($piece['oracleId'] ?? $piece['inventoryItem']['card']['oracleId'] ?? ''));
                $piece['inventoryOptions'] = '' !== $key ? ($optionsByOracle[$key] ?? []) : [];
            }
            unset($piece);
            $combo['cards'] = $cards;
        }
        unset($combo);
    }
}
