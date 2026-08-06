<?php

namespace App\Service\Checkout;

use App\Entity\CartItem;
use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\SealedInventoryItem;
use App\Entity\Store;
use App\Entity\User;
use App\Service\CaseCards\SectionSaleAllocator;
use App\Service\Credit\StoreCreditLedger;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Turns a cart into a persisted (but unflushed) order: prices each line at the
 * current listing price, consumes stock, applies store credit, and empties the
 * cart.
 *
 * Shared by the simulated test/kiosk checkout and the real card checkout so
 * both consume stock identically — a divergence here would mean orders that
 * cannot be restocked correctly on cancel.
 */
final readonly class CartOrderBuilder
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private SectionSaleAllocator $sectionSaleAllocator,
        private StoreCreditLedger $creditLedger,
    ) {
    }

    /**
     * The caller owns the transaction: nothing is flushed here.
     *
     * @param list<CartItem> $cartItems
     *
     * @throws OutOfStockException when a line can no longer be fulfilled
     */
    public function build(
        Store $store,
        ?User $user,
        array $cartItems,
        string $channel,
        string $fulfillment,
        string $customerName,
        ?string $customerEmail,
        bool $useStoreCredit,
    ): Order {
        $order = (new Order())
            ->setStore($store)
            ->setReference('ORD-'.strtoupper(bin2hex(random_bytes(4))))
            ->setCustomerName($customerName)
            ->setCustomerEmail($customerEmail)
            ->setChannel($channel)
            ->setFulfillment($fulfillment);

        $total = 0;
        foreach ($cartItems as $cartItem) {
            $total += $cartItem->isSealed()
                ? $this->addSealedLine($order, $cartItem)
                : $this->addSingleLine($order, $cartItem);
        }

        $order->setTotalCents($total);

        // Store credit: signed-in (non-kiosk) customers can put their balance
        // toward the order. The ledger entry joins the caller's flush, so the
        // spend lands atomically with the order or not at all.
        if ($useStoreCredit && $user instanceof User && Order::CHANNEL_KIOSK !== $channel) {
            $applied = min($this->creditLedger->balance($user, $store), $total);
            if ($applied > 0) {
                $this->creditLedger->spend($store, $user, $applied, $order);
                $order->setCreditAppliedCents($applied);
            }
        }

        $this->entityManager->persist($order);

        foreach ($cartItems as $cartItem) {
            if (null !== $cartItem->getId()) {
                $this->entityManager->remove($cartItem);
            }
        }

        return $order;
    }

    /**
     * Sealed lines sell a boxed product: no card, no case section, and stock
     * comes off the store's sealed listing instead.
     */
    private function addSealedLine(Order $order, CartItem $cartItem): int
    {
        $sealedItem = $cartItem->getSealedInventoryItem();
        $product = $sealedItem?->getSealedProduct();
        if (!$sealedItem instanceof SealedInventoryItem || null === $product || $sealedItem->getQuantity() < 1) {
            throw new OutOfStockException('One or more cart items are no longer in stock.');
        }

        $quantity = min($cartItem->getQuantity(), $sealedItem->getQuantity());
        $order->addLine((new OrderLine())
            ->setSealedProduct($product)
            ->setSealedInventoryItem($sealedItem)
            ->setCardName($product->getName())
            ->setQuantity($quantity)
            ->setPriceCents($sealedItem->getPriceCents())
            ->setAcquisitionCostCents($sealedItem->getAcquisitionCostCents()));

        $sealedItem->setQuantity($sealedItem->getQuantity() - $quantity);
        $sealedItem->touch();

        return $quantity * $sealedItem->getPriceCents();
    }

    private function addSingleLine(Order $order, CartItem $cartItem): int
    {
        $inventoryItem = $cartItem->getInventoryItem();
        if (!$inventoryItem instanceof InventoryItem || $inventoryItem->getQuantity() < 1) {
            throw new OutOfStockException('One or more cart items are no longer in stock.');
        }

        $quantity = min($cartItem->getQuantity(), $inventoryItem->getQuantity());
        $line = (new OrderLine())
            ->setCard($inventoryItem->getCard())
            ->setInventoryItem($inventoryItem)
            ->setCardName($inventoryItem->getCard()?->getName() ?? 'Unknown card')
            ->setQuantity($quantity)
            ->setPriceCents($inventoryItem->getPriceCents())
            ->setAcquisitionCostCents($inventoryItem->getAcquisitionCostCents());

        // The sale consumes real stock at placement. The line's quantity is
        // clamped to available stock above, so this can never go negative;
        // cancelling/refunding the order adds it back (OrderStockReleaser).
        $inventoryItem->setQuantity($inventoryItem->getQuantity() - $quantity);

        // If this listing sits in a display-case section with pool copies left,
        // the sale comes from the case: deplete the section pool and stamp the
        // line with its case/section for pull + print sheets.
        $this->sectionSaleAllocator->allocateLine($line, $inventoryItem, $quantity);

        $order->addLine($line);

        return $quantity * $inventoryItem->getPriceCents();
    }
}
