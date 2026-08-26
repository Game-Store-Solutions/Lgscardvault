<?php

namespace App\Service\Order;

use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\Credit\StoreCreditLedger;

/**
 * When staff shrink an order, store credit already spent cannot exceed the new
 * merchandise + tax total — the excess returns to the customer's ledger.
 */
final readonly class OrderCreditReconciler
{
    public function __construct(
        private UserRepository $users,
        private StoreCreditLedger $creditLedger,
    ) {
    }

    public function reconcile(Order $order): void
    {
        $applied = $order->getCreditAppliedCents();
        if ($applied < 1) {
            return;
        }

        $maxApplicable = max(0, $order->getTotalCents() + $order->getTaxCents());
        $excess = $applied - $maxApplicable;
        if ($excess < 1) {
            return;
        }

        $store = $order->getStore();
        $email = $order->getCustomerEmail();
        if (!$store instanceof Store || null === $email || '' === $email) {
            throw new \RuntimeException('This order used store credit but the customer account could not be found.');
        }

        $user = $this->users->findOneBy(['email' => $email]);
        if (!$user instanceof User) {
            throw new \RuntimeException('This order used store credit but the customer has no account to receive the refund.');
        }

        $this->creditLedger->grant(
            $store,
            $user,
            $excess,
            StoreCreditTransaction::KIND_ORDER,
            order: $order,
            note: sprintf('Credit returned after order %s was edited', $order->getReference()),
        );
        $order->setCreditAppliedCents($maxApplicable);
    }
}
