<?php

namespace App\Service\Order;

use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\SealedInventoryItem;
use App\Entity\Store;
use App\Repository\InventoryItemRepository;
use App\Repository\SealedInventoryItemRepository;
use App\Service\CaseCards\SectionSaleAllocator;

/**
 * Staff add/remove/qty changes on an open order: consume or restore stock the
 * same way checkout and cancel do. Captured amounts stay until staff settle
 * the net difference on PayPal/Square in one payment-adjustment call.
 */
final readonly class OrderLineEditor
{
    public function __construct(
        private InventoryItemRepository $inventoryItems,
        private SealedInventoryItemRepository $sealedItems,
        private SectionSaleAllocator $sectionSaleAllocator,
    ) {
    }

    public function assertEditable(Order $order): void
    {
        if (!$order->getStatus()->allowsLineEdits()) {
            throw new \RuntimeException('Delivered, cancelled, or refunded orders cannot be edited. Open a new order or issue a refund.');
        }
        if (null !== $order->getDisputeStatus() && '' !== $order->getDisputeStatus()) {
            throw new \RuntimeException('Disputed orders cannot be edited.');
        }
    }

    public function addFromListing(Order $order, Store $store, int $inventoryItemId, int $quantity = 1): Order
    {
        $this->assertEditable($order);
        if ($quantity < 1) {
            throw new \RuntimeException('Quantity must be at least 1.');
        }

        $item = $this->inventoryItems->findOneByStoreAndId($store, $inventoryItemId);
        if (!$item instanceof InventoryItem) {
            throw new \RuntimeException('That listing is not in this store\'s inventory.');
        }

        foreach ($order->getLines() as $existing) {
            if ($existing->getInventoryItem()?->getId() === $item->getId()) {
                $this->changeQuantity($order, $existing, $existing->getQuantity() + $quantity);

                return $order;
            }
        }

        $this->consumeSingles($item, $quantity);
        $line = (new OrderLine())
            ->setCard($item->getCard())
            ->setInventoryItem($item)
            ->setCardName($item->getCard()?->getName() ?? 'Unknown card')
            ->setQuantity($quantity)
            ->setPriceCents($item->getPriceCents())
            ->setAcquisitionCostCents($item->getAcquisitionCostCents());
        $this->sectionSaleAllocator->allocateLine($line, $item, $quantity);
        $order->addLine($line);
        $order->recalculateTotalCents();

        return $order;
    }

    public function addFromSealedListing(Order $order, Store $store, int $sealedInventoryItemId, int $quantity = 1): Order
    {
        $this->assertEditable($order);
        if ($quantity < 1) {
            throw new \RuntimeException('Quantity must be at least 1.');
        }

        $item = $this->sealedItems->findOneForStore($store, $sealedInventoryItemId);
        if (!$item instanceof SealedInventoryItem) {
            throw new \RuntimeException('That sealed listing is not in this store\'s inventory.');
        }

        foreach ($order->getLines() as $existing) {
            if ($existing->getSealedInventoryItem()?->getId() === $item->getId()) {
                $this->changeQuantity($order, $existing, $existing->getQuantity() + $quantity);

                return $order;
            }
        }

        $this->consumeSealed($item, $quantity);
        $product = $item->getSealedProduct();
        $order->addLine((new OrderLine())
            ->setSealedProduct($product)
            ->setSealedInventoryItem($item)
            ->setCardName($product?->getName() ?? 'Sealed product')
            ->setQuantity($quantity)
            ->setPriceCents($item->getPriceCents())
            ->setAcquisitionCostCents($item->getAcquisitionCostCents()));
        $order->recalculateTotalCents();

        return $order;
    }

    public function changeQuantity(Order $order, OrderLine $line, int $quantity): Order
    {
        $this->assertEditable($order);
        $this->assertLineOnOrder($order, $line);
        if ($quantity < 0) {
            throw new \RuntimeException('Quantity cannot be negative.');
        }
        if (0 === $quantity) {
            return $this->removeLine($order, $line);
        }

        $current = $line->getQuantity();
        if ($quantity === $current) {
            return $order;
        }
        if ($quantity > $current) {
            $this->increaseLine($line, $quantity - $current);
        } else {
            $this->decreaseLine($line, $current - $quantity);
        }
        $order->recalculateTotalCents();

        return $order;
    }

    public function removeLine(Order $order, OrderLine $line): Order
    {
        $this->assertEditable($order);
        $this->assertLineOnOrder($order, $line);
        if ($order->getLines()->count() <= 1) {
            throw new \RuntimeException('An order must keep at least one card. Cancel or refund the order instead.');
        }

        $this->decreaseLine($line, $line->getQuantity());
        $order->removeLine($line);
        $order->recalculateTotalCents();

        return $order;
    }

    private function assertLineOnOrder(Order $order, OrderLine $line): void
    {
        if ($line->getParentOrder()?->getId() !== $order->getId()) {
            throw new \RuntimeException('That line is not on this order.');
        }
    }

    private function increaseLine(OrderLine $line, int $delta): void
    {
        $item = $line->getInventoryItem();
        $sealed = $line->getSealedInventoryItem();
        if ($item instanceof InventoryItem) {
            $this->consumeSingles($item, $delta);
            $this->allocateAdditionalCaseCopies($line, $item, $delta);
        } elseif ($sealed instanceof SealedInventoryItem) {
            $this->consumeSealed($sealed, $delta);
        }
        $line->setQuantity($line->getQuantity() + $delta);
    }

    private function decreaseLine(OrderLine $line, int $delta): void
    {
        $item = $line->getInventoryItem();
        $sealed = $line->getSealedInventoryItem();
        if ($item instanceof InventoryItem) {
            $item->setQuantity($item->getQuantity() + $delta);
            $this->releaseCaseCopies($line, $delta);
        } elseif ($sealed instanceof SealedInventoryItem) {
            $sealed->setQuantity($sealed->getQuantity() + $delta);
            $sealed->touch();
        }
        $line->setQuantity(max(0, $line->getQuantity() - $delta));
    }

    private function consumeSingles(InventoryItem $item, int $quantity): void
    {
        if ($item->getQuantity() < $quantity) {
            $name = $item->getCard()?->getName() ?? 'listing';
            throw new \RuntimeException(sprintf('"%s" only has %d in stock.', $name, $item->getQuantity()));
        }
        $item->setQuantity($item->getQuantity() - $quantity);
    }

    private function consumeSealed(SealedInventoryItem $item, int $quantity): void
    {
        if ($item->getQuantity() < $quantity) {
            $name = $item->getSealedProduct()?->getName() ?? 'sealed product';
            throw new \RuntimeException(sprintf('"%s" only has %d in stock.', $name, $item->getQuantity()));
        }
        $item->setQuantity($item->getQuantity() - $quantity);
        $item->touch();
    }

    private function allocateAdditionalCaseCopies(OrderLine $line, InventoryItem $item, int $quantity): void
    {
        $remaining = $quantity;
        $pool = $line->getSectionCard();
        if (null !== $pool) {
            $take = min($remaining, $pool->remaining());
            if ($take > 0) {
                $pool->setSoldQuantity($pool->getSoldQuantity() + $take);
                $line->setCaseQuantity($line->getCaseQuantity() + $take);
                $remaining -= $take;
            }
        }
        if ($remaining > 0 && null === $line->getSectionCard()) {
            $this->sectionSaleAllocator->allocateLine($line, $item, $remaining);
        }
    }

    private function releaseCaseCopies(OrderLine $line, int $delta): void
    {
        $fromCase = min($delta, $line->getCaseQuantity());
        if ($fromCase < 1) {
            return;
        }
        $pool = $line->getSectionCard();
        if (null !== $pool) {
            $pool->setSoldQuantity(max(0, $pool->getSoldQuantity() - $fromCase));
        }
        $line->setCaseQuantity($line->getCaseQuantity() - $fromCase);
        if ($line->getCaseQuantity() < 1) {
            $line->setSectionCard(null);
        }
    }
}
