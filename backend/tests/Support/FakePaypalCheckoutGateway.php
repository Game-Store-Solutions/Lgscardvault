<?php

namespace App\Tests\Support;

use App\Entity\Store;
use App\Service\Payments\PaypalCheckoutGatewayInterface;

final class FakePaypalCheckoutGateway implements PaypalCheckoutGatewayInterface
{
    public bool $ready = false;

    public ?string $declineWith = null;

    public ?string $refundDeclineWith = null;

    /** @var list<array{amount: int, referenceId: string}> */
    public array $orders = [];

    /** @var list<array{amount: int, paypalOrderId: string, idempotencyKey: string}> */
    public array $charges = [];

    /** @var list<array{captureId: string, amount: int, idempotencyKey: string}> */
    public array $refunds = [];

    public string $merchantId = 'PAYPALMERCHANT1';

    public function checkoutConfig(Store $store): array
    {
        return [
            'enabled' => $this->ready,
            'clientId' => $this->ready ? 'sandbox-paypal-client' : '',
            'merchantId' => $this->ready ? $this->merchantId : '',
            'environment' => 'sandbox',
            'currency' => 'USD',
            'message' => $this->ready ? null : 'PayPal checkout is disabled in this test environment.',
        ];
    }

    public function isReady(Store $store): bool
    {
        return $this->ready;
    }

    public function createOrder(
        Store $store,
        int $amountCents,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
    ): string {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }
        if (!$this->ready) {
            throw new \RuntimeException('This store has not connected PayPal yet.');
        }

        $this->orders[] = ['amount' => $amountCents, 'referenceId' => $referenceId];

        return 'PAYPAL-ORDER-'.count($this->orders);
    }

    public function charge(
        Store $store,
        int $amountCents,
        string $paypalOrderId,
        string $idempotencyKey,
        int $taxCents = 0,
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }
        if (!$this->ready) {
            throw new \RuntimeException('This store has not connected PayPal yet.');
        }

        $this->charges[] = [
            'amount' => $amountCents,
            'paypalOrderId' => $paypalOrderId,
            'idempotencyKey' => $idempotencyKey,
        ];

        $n = count($this->charges);

        return [
            'paymentId' => 'ppcap_'.$n,
            'status' => 'COMPLETED',
            'receiptUrl' => null,
            'squareOrderId' => null,
            'taxCents' => $taxCents,
            'chargedCents' => $amountCents,
        ];
    }

    public function refund(Store $store, string $captureId, int $amountCents, string $idempotencyKey, ?string $reason = null): array
    {
        if (null !== $this->refundDeclineWith) {
            throw new \RuntimeException($this->refundDeclineWith);
        }

        $this->refunds[] = [
            'captureId' => $captureId,
            'amount' => $amountCents,
            'idempotencyKey' => $idempotencyKey,
        ];

        return [
            'refundId' => 'pprfd_'.count($this->refunds),
            'status' => 'COMPLETED',
        ];
    }
}
