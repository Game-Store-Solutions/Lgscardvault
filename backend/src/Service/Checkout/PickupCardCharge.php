<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\PaypalCheckoutGatewayInterface;
use App\Entity\StorePaymentAccount;
use App\Service\Billing\PlatformFeeRecorder;

/**
 * Applies location sales tax and captures the card for a reserved pickup order.
 */
final readonly class PickupCardCharge
{
    public function __construct(
        private CheckoutGatewayInterface $checkoutGateway,
        private PaypalCheckoutGatewayInterface $paypalCheckout,
        private PickupTaxPolicy $taxPolicy,
        private PlatformFeeRecorder $platformFees,
    ) {
    }

    /**
     * @return array{charged: bool, receiptUrl: string|null}
     */
    public function capture(
        Store $store,
        Order $order,
        string $sourceId,
        ?string $verificationToken,
        ?string $buyerEmail,
        ?string $squareCustomerId,
        string $provider = StorePaymentAccount::PROVIDER_SQUARE,
    ): array {
        $lineItems = SquareLineItems::fromOrder($order);
        $quote = $this->checkoutGateway->quotePickupTotals($store, $lineItems, $order->getCreditAppliedCents());
        $order->setTaxCents($quote['taxCents']);

        $taxableSubtotal = $order->getTotalCents();
        $merchandiseDue = max(0, $taxableSubtotal - $order->getCreditAppliedCents());
        $block = $this->taxPolicy->cardCheckoutBlockReason($store, (int) $quote['taxCents'], $taxableSubtotal);
        if (null !== $block) {
            throw new PickupTaxNotReadyException($block);
        }

        $amountDue = $merchandiseDue + $order->getTaxCents();
        if ($amountDue <= 0) {
            $order->setPaidCents(0);

            return ['charged' => false, 'receiptUrl' => null];
        }

        if ('' === $sourceId) {
            throw new \RuntimeException('A payment method is required.');
        }

        if (StorePaymentAccount::PROVIDER_PAYPAL === $provider) {
            $payment = $this->paypalCheckout->charge(
                $store,
                $amountDue,
                $sourceId,
                $order->getReference(),
                $order->getTaxCents(),
            );
            $charged = (int) ($payment['chargedCents'] ?? $amountDue);
            $order
                ->setTaxCents((int) ($payment['taxCents'] ?? $quote['taxCents']))
                ->setPaidCents($charged)
                ->setPaymentReference($payment['paymentId'])
                ->setPaymentProvider(StorePaymentAccount::PROVIDER_PAYPAL)
                ->recordPaymentCapture($payment['paymentId'], $charged);
            $this->platformFees->recordCollectedFee($store, (int) ($payment['platformFeeCents'] ?? 0));

            return [
                'charged' => true,
                'receiptUrl' => $payment['receiptUrl'] ?? null,
            ];
        }

        $payment = $this->checkoutGateway->charge(
            $store,
            $merchandiseDue,
            $sourceId,
            $order->getReference(),
            $verificationToken,
            $order->getReference(),
            $buyerEmail,
            $squareCustomerId,
            $lineItems,
            $order->getCreditAppliedCents(),
            $order->getCustomerName(),
            Order::FULFILLMENT_PICKUP,
        );

        $charged = (int) ($payment['chargedCents'] ?? $amountDue);
        $order
            ->setTaxCents((int) ($payment['taxCents'] ?? $quote['taxCents']))
            ->setPaidCents($charged)
            ->setPaymentReference($payment['paymentId'])
            ->setPaymentProvider(StorePaymentAccount::PROVIDER_SQUARE)
            ->setSquareOrderId($payment['squareOrderId'] ?? null)
            ->recordPaymentCapture($payment['paymentId'], $charged);
        $this->platformFees->recordCollectedFee($store, (int) ($payment['platformFeeCents'] ?? 0));

        return [
            'charged' => true,
            'receiptUrl' => $payment['receiptUrl'] ?? null,
        ];
    }
}
