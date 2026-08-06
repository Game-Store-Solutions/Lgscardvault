<?php

namespace App\Service\Payments;

use App\Entity\StoreCustomer;
use App\Entity\User;
use App\Repository\StoreCustomerRepository;

/**
 * Keeps per-store customer profiles aligned with the shopper's marketplace wallet.
 *
 * Square still vaults per merchant at checkout time; this syncs the display fields
 * (brand, last4, method type) so every store page shows the same saved method.
 */
final class CustomerPaymentProfileSync
{
    public function __construct(
        private readonly StoreCustomerRepository $customers,
    ) {
    }

    public function syncUserToAllStoreProfiles(User $user): void
    {
        foreach ($this->customers->findAllForUser($user) as $customer) {
            $this->applyUserPaymentToStoreCustomer($user, $customer);
        }
    }

    public function applyUserPaymentToStoreCustomer(User $user, StoreCustomer $customer): void
    {
        if (null === $user->getPaymentLast4() || '' === $user->getPaymentLast4()) {
            return;
        }

        $customer
            ->setPaymentMethodType($user->getPaymentMethodType())
            ->setPaymentBrand($user->getPaymentBrand())
            ->setPaymentLast4($user->getPaymentLast4())
            ->setPaymentExpires($user->getPaymentExpires())
            ->setPaymentCustomerId(null)
            ->setPaymentCardId(null);
    }
}
