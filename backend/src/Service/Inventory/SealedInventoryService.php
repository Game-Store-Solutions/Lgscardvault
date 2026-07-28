<?php

namespace App\Service\Inventory;

use App\Entity\SealedInventoryItem;
use App\Entity\SealedProduct;
use App\Entity\Store;
use App\Repository\SealedInventoryItemRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Store sealed-inventory writes. One line per (store, product); adds fold
 * into the existing line. Default asking price falls back to the TCGplayer
 * market snapshot when the store doesn't set one.
 */
final readonly class SealedInventoryService
{
    public function __construct(
        private SealedInventoryItemRepository $items,
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function add(
        Store $store,
        SealedProduct $product,
        int $quantity,
        ?int $priceCents = null,
        ?int $acquisitionCostCents = null,
    ): SealedInventoryItem {
        $item = $this->items->findLine($store, $product);
        if (!$item instanceof SealedInventoryItem) {
            $item = new SealedInventoryItem();
            $item->setStore($store);
            $item->setSealedProduct($product);
            $this->entityManager->persist($item);
        }

        $item->setQuantity($item->getQuantity() + max(0, $quantity));

        if (null !== $priceCents) {
            $item->setPriceCents($priceCents);
        } elseif (0 === $item->getPriceCents()) {
            $item->setPriceCents($product->getMarketPriceCents() ?? 0);
        }

        if (null !== $acquisitionCostCents) {
            $item->setAcquisitionCostCents($acquisitionCostCents);
        }

        $item->touch();
        $this->entityManager->flush();

        return $item;
    }

    public function update(
        SealedInventoryItem $item,
        ?int $quantity = null,
        ?int $priceCents = null,
        ?int $acquisitionCostCents = null,
    ): SealedInventoryItem {
        if (null !== $quantity) {
            $item->setQuantity($quantity);
        }
        if (null !== $priceCents) {
            $item->setPriceCents($priceCents);
        }
        if (null !== $acquisitionCostCents) {
            $item->setAcquisitionCostCents($acquisitionCostCents);
        }

        $item->touch();
        $this->entityManager->flush();

        return $item;
    }

    public function remove(SealedInventoryItem $item): void
    {
        $this->entityManager->remove($item);
        $this->entityManager->flush();
    }
}
