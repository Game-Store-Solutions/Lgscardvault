<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;

/**
 * Applies location sales tax and captures the card for a reserved pickup order.
 */
final readonly class PickupCardCharge
{
    public function __construct(
        private CheckoutGatewayInterface $checkoutGateway,
        private PickupTaxPolicy $taxPolicy,
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
    ): array {
        $lineItems = SquareLineItems::fromOrder($order);
        $quote = $this->checkoutGateway->quotePickupTotals($store, $lineItems, $order->getCreditAppliedCents());
        $order->setTaxCents($quote['taxCents']);

        $merchandiseDue = max(0, $order->getTotalCents() - $order->getCreditAppliedCents());
        $block = $this->taxPolicy->cardCheckoutBlockReason($store, (int) $quote['taxCents'], $merchandiseDue);
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

        $order
            ->setTaxCents((int) ($payment['taxCents'] ?? $quote['taxCents']))
            ->setPaidCents((int) ($payment['chargedCents'] ?? $amountDue))
            ->setPaymentReference($payment['paymentId'])
            ->setSquareOrderId($payment['squareOrderId'] ?? null);

        return [
            'charged' => true,
            'receiptUrl' => $payment['receiptUrl'] ?? null,
        ];
    }
}
