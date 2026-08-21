<?php

namespace App\Service\Store;

use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\InventoryItemRepository;

/**
 * Builds the public storefront spotlight rail: pinned listings first, then
 * cards at/above the price floor, then cheaper in-stock fillers until min.
 */
final class StoreSpotlightAssembler
{
    public const ITEMS_CAP = 24;

    public function __construct(
        private readonly InventoryItemRepository $inventoryItems,
    ) {
    }

    /**
     * @return list<InventoryItem>
     */
    public function assemble(Store $store, ?string $gameCode = null): array
    {
        $max = max(1, min(self::ITEMS_CAP, $store->getSpotlightMaxItems()));
        $min = max(0, min($max, $store->getSpotlightMinItems()));
        $game = null !== $gameCode && '' !== trim($gameCode) ? trim($gameCode) : null;

        $picked = $this->inventoryItems->findByStoreAndIds(
            $store,
            $store->getSpotlightPinnedInventoryIds(),
            inStockOnly: true,
            gameCode: $game,
        );
        if (count($picked) >= $max) {
            return array_slice($picked, 0, $max);
        }

        $seen = [];
        foreach ($picked as $item) {
            $id = $item->getId();
            if (null !== $id) {
                $seen[] = $id;
            }
        }

        foreach ($this->inventoryItems->findInStockByPriceDesc(
            $store,
            $game,
            $seen,
            $max - count($picked),
            $store->getSpotlightMinPriceCents(),
        ) as $item) {
            $picked[] = $item;
            $id = $item->getId();
            if (null !== $id) {
                $seen[] = $id;
            }
        }

        if (count($picked) < $min) {
            foreach ($this->inventoryItems->findInStockByPriceDesc(
                $store,
                $game,
                $seen,
                $min - count($picked),
            ) as $item) {
                $picked[] = $item;
            }
        }

        return array_slice($picked, 0, $max);
    }
}
