<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\CaseCards\SectionSaleAllocator;
use App\Service\Credit\StoreCreditLedger;

/**
 * Undoes what {@see CartOrderBuilder} consumed: puts stock back on the listing
 * and the case pool, and returns any store credit that was spent.
 *
 * Used both when staff cancel or refund an order and when a card payment fails
 * after the order was already reserved.
 */
final readonly class OrderStockReleaser
{
    public function __construct(
        private SectionSaleAllocator $sectionSaleAllocator,
        private StoreCreditLedger $creditLedger,
        private UserRepository $userRepository,
    ) {
    }

    /**
     * Callers are responsible for guarding against double release (the status
     * state machine treats cancelled/refunded as terminal) and for flushing.
     */
    public function release(Order $order): void
    {
        foreach ($order->getLines() as $line) {
            $item = $line->getInventoryItem();
            if (null !== $item) {
                $item->setQuantity($item->getQuantity() + $line->getQuantity());
            }

            // Sealed lines restock their own listing; they never sit in a
            // display-case section, so there is no pool to release.
            $sealedItem = $line->getSealedInventoryItem();
            if (null !== $sealedItem) {
                $sealedItem->setQuantity($sealedItem->getQuantity() + $line->getQuantity());
                $sealedItem->touch();
            }

            $this->sectionSaleAllocator->releaseLine($line);
        }

        $this->refundCredit($order);
    }

    private function refundCredit(Order $order): void
    {
        $store = $order->getStore();
        $email = $order->getCustomerEmail();

        if ($order->getCreditAppliedCents() <= 0 || !$store instanceof Store || null === $email) {
            return;
        }

        $customer = $this->userRepository->findOneBy(['email' => $email]);
        if (!$customer instanceof User) {
            return;
        }

        $this->creditLedger->grant(
            $store,
            $customer,
            $order->getCreditAppliedCents(),
            StoreCreditTransaction::KIND_ORDER,
            order: $order,
            note: sprintf('Refund for order %s', $order->getReference()),
        );
    }
}
