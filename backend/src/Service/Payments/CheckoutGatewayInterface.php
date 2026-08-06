<?php

namespace App\Service\Payments;

use App\Entity\Store;

/**
 * Charging a shopper on behalf of a store.
 *
 * Keeps checkout independent of the processor: {@see StoreCheckoutGateway} is
 * the Square implementation, and tests substitute a fake so the money paths
 * can be exercised without network calls.
 */
interface CheckoutGatewayInterface
{
    /**
     * Public client configuration for the store's payment form.
     *
     * @return array{enabled: bool, applicationId: string, locationId: string, environment: string, currency: string, countryCode: string}
     */
    public function checkoutConfig(Store $store): array;

    public function isReady(Store $store): bool;

    /**
     * @param string $idempotencyKey stable per order, so a retry cannot double-charge
     *
     * @return array{paymentId: string, status: string, receiptUrl: string|null}
     *
     * @throws \RuntimeException when the store is not connected or the payment is declined
     */
    public function charge(
        Store $store,
        int $amountCents,
        string $sourceId,
        string $idempotencyKey,
        ?string $verificationToken = null,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?string $customerId = null,
    ): array;

    /**
     * @return array{paymentId: string, status: string, receiptUrl: string|null}
     */
    public function chargeVaultedCard(
        Store $store,
        int $amountCents,
        string $customerId,
        string $cardId,
        string $idempotencyKey,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
    ): array;

    /**
     * @return array{refundId: string, status: string}
     */
    public function refund(Store $store, string $paymentId, int $amountCents, string $idempotencyKey, ?string $reason = null): array;

    /**
     * Save a tokenized payment method on the store's Square account for faster checkout.
     *
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @return array{customerId: string, cardId: string, last4: string|null, brand: string|null, expMonth: string|null, expYear: string|null}
     *
     * @throws \RuntimeException when the store is not connected or Square declines
     */
    public function vaultPaymentMethod(
        Store $store,
        string $sourceId,
        ?string $verificationToken,
        array $buyer,
        ?string $existingCustomerId,
        ?string $previousCardId,
    ): array;
}
