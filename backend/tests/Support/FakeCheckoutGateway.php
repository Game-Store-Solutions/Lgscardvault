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

    /** @var list<array{amount: int, sourceId: string, idempotencyKey: string, lineItems: ?array}> */
    public array $charges = [];

    /** @var list<array{paymentId: string, amount: int, idempotencyKey: string, reason: ?string}> */
    public array $refunds = [];

    /** @var list<array{amount: int, idempotencyKey: string, referenceId: string}> */
    public array $paymentLinks = [];

    /** Message thrown instead of refunding; null means the refund succeeds. */
    public ?string $refundDeclineWith = null;

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
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->charges[] = [
            'amount' => $amountCents,
            'sourceId' => $sourceId,
            'idempotencyKey' => $idempotencyKey,
            'lineItems' => $lineItems,
        ];

        $n = count($this->charges);

        return [
            'paymentId' => 'sqpmt_'.$n,
            'status' => 'COMPLETED',
            'receiptUrl' => 'https://squareup.com/receipt/test',
            'squareOrderId' => null !== $lineItems && [] !== $lineItems ? 'sqord_'.$n : null,
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
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        return $this->charge(
            $store,
            $amountCents,
            $cardId,
            $idempotencyKey,
            null,
            $referenceId,
            $buyerEmail,
            $customerId,
            $lineItems,
            $creditCents,
            $buyerName,
            $fulfillment,
        );
    }

    public function refund(Store $store, string $paymentId, int $amountCents, string $idempotencyKey, ?string $reason = null): array
    {
        if (null !== $this->refundDeclineWith) {
            throw new \RuntimeException($this->refundDeclineWith);
        }

        $this->refunds[] = [
            'paymentId' => $paymentId,
            'amount' => $amountCents,
            'idempotencyKey' => $idempotencyKey,
            'reason' => $reason,
        ];

        return [
            'refundId' => 'sqrfd_'.count($this->refunds),
            'status' => 'COMPLETED',
        ];
    }

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
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->paymentLinks[] = [
            'amount' => $amountCents,
            'idempotencyKey' => $idempotencyKey,
            'referenceId' => $referenceId,
        ];

        $n = count($this->paymentLinks);

        return [
            'url' => 'https://square.link/u/test-'.$referenceId,
            'squareOrderId' => 'sqord_link_'.$n,
        ];
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
