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
     * Preview pickup sales tax from the store's Square location (no payment).
     *
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array{taxCents: int, dueCents: int}
     */
    public function quotePickupTotals(Store $store, array $lineItems, int $creditCents = 0): array;

    /**
     * @param string                                                              $idempotencyKey stable per order, so a retry cannot double-charge
     * @param list<array{name: string, quantity: int, priceCents: int}>|null       $lineItems      when set, creates a Square Order then pays it
     *
     * @return array{paymentId: string, status: string, receiptUrl: string|null, squareOrderId: string|null, taxCents: int, chargedCents: int, platformFeeCents: int}
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
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array;

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}>|null $lineItems
     *
     * @return array{paymentId: string, status: string, receiptUrl: string|null, squareOrderId: string|null, taxCents: int, chargedCents: int, platformFeeCents: int}
     */
    public function chargeVaultedCard(
        Store $store,
        int $amountCents,
        string $customerId,
        string $cardId,
        string $idempotencyKey,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array;

    /**
     * @return array{refundId: string, status: string}
     */
    public function refund(Store $store, string $paymentId, int $amountCents, string $idempotencyKey, ?string $reason = null): array;

    /**
     * Unpaid pickup invoice that appears under Square POS → Invoices so staff
     * can collect on the register. The order must not use auto-applied taxes.
     *
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array{url: string|null, squareOrderId: string, squareInvoiceId: string}
     *
     * @throws \RuntimeException when Square is not ready, the buyer has no email, or Square declines
     */
    public function createPayInStoreInvoice(
        Store $store,
        string $idempotencyKey,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array;

    /**
     * Drop an unpaid invoice (and its Square order) so it leaves the register list.
     * Paid or missing invoices are a no-op.
     */
    public function cancelInvoice(Store $store, string $invoiceId): void;

    /**
     * Square-hosted checkout page (and QR) for an unpaid pickup order.
     *
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array{url: string, squareOrderId: string|null}
     *
     * @throws \RuntimeException when the store is not connected or Square declines
     */
    public function createPaymentLink(
        Store $store,
        int $amountCents,
        string $idempotencyKey,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
        ?string $paymentNote = null,
    ): array;

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
