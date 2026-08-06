<?php

namespace App\Tests\Support;

use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;

/**
 * Stands in for Square during tests: records what would have been charged and
 * can be told to decline, so checkout's money paths are exercised without
 * network access.
 */
final class FakeCheckoutGateway implements CheckoutGatewayInterface
{
    public bool $ready = true;

    /** Message thrown instead of charging; null means the charge succeeds. */
    public ?string $declineWith = null;

    /** @var list<array{amount: int, sourceId: string, idempotencyKey: string}> */
    public array $charges = [];

    public function checkoutConfig(Store $store): array
    {
        return [
            'enabled' => $this->ready,
            'message' => $this->ready ? null : 'Checkout is disabled in this test environment.',
            'ownerMessage' => $this->ready ? null : 'Fake checkout gateway disabled.',
            'applicationId' => 'sandbox-app-id',
            'locationId' => $this->ready ? 'LOCATION1' : '',
            'environment' => 'sandbox',
            'currency' => 'USD',
            'countryCode' => 'US',
        ];
    }

    public function isReady(Store $store): bool
    {
        return $this->ready;
    }

    public function charge(
        Store $store,
        int $amountCents,
        string $sourceId,
        string $idempotencyKey,
        ?string $verificationToken = null,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?string $customerId = null,
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->charges[] = [
            'amount' => $amountCents,
            'sourceId' => $sourceId,
            'idempotencyKey' => $idempotencyKey,
        ];

        return [
            'paymentId' => 'sqpmt_'.count($this->charges),
            'status' => 'COMPLETED',
            'receiptUrl' => 'https://squareup.com/receipt/test',
        ];
    }

    public function chargeVaultedCard(
        Store $store,
        int $amountCents,
        string $customerId,
        string $cardId,
        string $idempotencyKey,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
    ): array {
        return $this->charge($store, $amountCents, $cardId, $idempotencyKey, null, $referenceId, $buyerEmail, $customerId);
    }

    public function refund(Store $store, string $paymentId, int $amountCents, string $idempotencyKey, ?string $reason = null): array
    {
        return ['refundId' => 'sqrfd_1', 'status' => 'COMPLETED'];
    }

    public function vaultPaymentMethod(
        Store $store,
        string $sourceId,
        ?string $verificationToken,
        array $buyer,
        ?string $existingCustomerId,
        ?string $previousCardId,
    ): array {
        return [
            'customerId' => $existingCustomerId ?? 'sqcust_test',
            'cardId' => 'sqcard_'.bin2hex(random_bytes(4)),
            'last4' => '4242',
            'brand' => 'VISA',
            'expMonth' => '12',
            'expYear' => '2030',
        ];
    }
}
