<?php

namespace App\Service\Payments;

use App\Entity\Store;

/**
 * Shopper checkout through a store's connected PayPal account.
 */
interface PaypalCheckoutGatewayInterface
{
    /**
     * @return array{enabled: bool, clientId: string, merchantId: string, environment: string, currency: string, message: ?string}
     */
    public function checkoutConfig(Store $store): array;

    public function isReady(Store $store): bool;

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     */
    public function createOrder(
        Store $store,
        int $amountCents,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
    ): string;

    /**
     * @return array{paymentId: string, status: string, receiptUrl: string|null, squareOrderId: null, taxCents: int, chargedCents: int, platformFeeCents: int}
     */
    public function charge(
        Store $store,
        int $amountCents,
        string $paypalOrderId,
        string $idempotencyKey,
        int $taxCents = 0,
    ): array;

    /**
     * @return array{refundId: string, status: string}
     */
    public function refund(Store $store, string $captureId, int $amountCents, string $idempotencyKey, ?string $reason = null): array;
}
