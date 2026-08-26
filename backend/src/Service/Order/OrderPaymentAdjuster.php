<?php

namespace App\Service\Order;

use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Service\Billing\PlatformFeeRecorder;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\PaypalCheckoutGatewayInterface;

/**
 * Pushes the net line-edit difference to Square/PayPal in one staff action.
 * Credits become one (or a short waterfall of) refunds; extras on PayPal
 * become one supplemental capture the shopper approves.
 */
final readonly class OrderPaymentAdjuster
{
    public function __construct(
        private CheckoutGatewayInterface $square,
        private PaypalCheckoutGatewayInterface $paypal,
        private PlatformFeeRecorder $platformFees,
    ) {
    }

    public function refundCredit(Order $order): Order
    {
        $this->assertAdjustable($order);
        $credit = $order->getCreditOwedCents();
        if ($credit < 1) {
            throw new \RuntimeException('This order is not overpaid.');
        }

        $this->refundAmount($order, $credit, 'adj-'.$order->getId().'-'.$order->amountDueCents());

        return $order;
    }

    public function refundRemaining(Order $order, string $idempotencyPrefix): void
    {
        $paid = $order->getPaidCents();
        if ($paid < 1) {
            return;
        }

        $order->ensurePaymentCaptureLedger();
        if ([] === $order->getPaymentCaptures()) {
            return;
        }

        $this->refundAmount($order, $paid, $idempotencyPrefix);
    }

    /**
     * @return array{orderId: string, dueCents: int, paypal: array<string, mixed>}
     */
    public function createSupplementalPaypalOrder(Order $order): array
    {
        $this->assertAdjustable($order);
        $due = $order->getBalanceDueCents();
        if ($due < 1) {
            throw new \RuntimeException('Nothing extra is due on this order.');
        }
        if (StorePaymentAccount::PROVIDER_PAYPAL !== $order->getPaymentProvider()) {
            throw new \RuntimeException('Extra cards on a PayPal order can be charged in PayPal. Collect other processors at the counter.');
        }

        $store = $this->requireStore($order);
        if (!$this->paypal->isReady($store)) {
            throw new \RuntimeException('This store has not connected PayPal yet.');
        }

        $orderId = $this->paypal->createOrder(
            $store,
            $due,
            $order->getReference().'-adj',
            $this->lineItems($order),
        );

        return [
            'orderId' => $orderId,
            'dueCents' => $due,
            'paypal' => $this->paypal->checkoutConfig($store),
        ];
    }

    public function captureSupplementalPaypal(Order $order, string $paypalOrderId): Order
    {
        $this->assertAdjustable($order);
        $due = $order->getBalanceDueCents();
        if ($due < 1) {
            throw new \RuntimeException('Nothing extra is due on this order.');
        }
        if (StorePaymentAccount::PROVIDER_PAYPAL !== $order->getPaymentProvider()) {
            throw new \RuntimeException('This order was not captured with PayPal.');
        }
        if ('' === trim($paypalOrderId)) {
            throw new \RuntimeException('A PayPal order is required.');
        }

        $store = $this->requireStore($order);
        $payment = $this->paypal->charge(
            $store,
            $due,
            $paypalOrderId,
            'adj-cap-'.$order->getId().'-'.$due,
            $order->getTaxCents(),
        );
        $captureId = (string) ($payment['paymentId'] ?? '');
        $charged = (int) ($payment['chargedCents'] ?? $due);
        if ('' === $captureId || $charged < 1) {
            throw new \RuntimeException('PayPal could not complete this payment.');
        }

        $order->ensurePaymentCaptureLedger();
        $order->recordPaymentCapture($captureId, $charged);
        $order->setPaidCents($order->getPaidCents() + $charged);
        $this->platformFees->recordFromOrder($order);

        return $order;
    }

    private function refundAmount(Order $order, int $amountCents, string $idempotencyPrefix): void
    {
        $store = $this->requireStore($order);
        $order->ensurePaymentCaptureLedger();
        $plan = $order->planCaptureRefunds($amountCents);
        if ([] === $plan) {
            throw new \RuntimeException('No captured payment to refund.');
        }

        $multi = count($plan) > 1;
        foreach ($plan as $step) {
            $key = $idempotencyPrefix;
            if ($multi || $step['id'] !== (string) $order->getPaymentReference()) {
                $key .= '-'.$step['id'];
            }

            $result = $this->refundOnProvider($order, $store, $step['id'], $step['amountCents'], $key);
            $status = strtoupper((string) ($result['status'] ?? ''));
            if (in_array($status, ['FAILED', 'REJECTED'], true)) {
                throw new \RuntimeException('The payment processor could not refund this payment. Try again from the Square or PayPal dashboard.');
            }

            $order->applyCaptureRefund($step['id'], $step['amountCents']);
            $order->setPaidCents(max(0, $order->getPaidCents() - $step['amountCents']));
        }
    }

    /**
     * @return array{refundId: string, status: string}
     */
    private function refundOnProvider(Order $order, Store $store, string $captureId, int $amountCents, string $idempotencyKey): array
    {
        $reason = sprintf('Order %s payment adjustment', $order->getReference());
        if (StorePaymentAccount::PROVIDER_PAYPAL === $order->getPaymentProvider()) {
            return $this->paypal->refund($store, $captureId, $amountCents, $idempotencyKey, $reason);
        }

        return $this->square->refund($store, $captureId, $amountCents, $idempotencyKey, $reason);
    }

    private function assertAdjustable(Order $order): void
    {
        if ($order->getStatus()->returnsStock()) {
            throw new \RuntimeException('Cancelled or refunded orders cannot be adjusted.');
        }
        if (null !== $order->getDisputeStatus() && '' !== $order->getDisputeStatus()) {
            throw new \RuntimeException('Disputed orders cannot be adjusted.');
        }
    }

    private function requireStore(Order $order): Store
    {
        $store = $order->getStore();
        if (!$store instanceof Store) {
            throw new \RuntimeException('Order has no store.');
        }

        return $store;
    }

    /** @return list<array{name: string, quantity: int, priceCents: int}> */
    private function lineItems(Order $order): array
    {
        $items = [];
        foreach ($order->getLines() as $line) {
            $items[] = [
                'name' => $line->getCardName(),
                'quantity' => $line->getQuantity(),
                'priceCents' => $line->getPriceCents(),
            ];
        }

        return $items;
    }
}
