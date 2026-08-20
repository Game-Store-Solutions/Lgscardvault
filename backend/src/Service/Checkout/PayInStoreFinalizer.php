<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;
use Psr\Log\LoggerInterface;

/**
 * Stamps a reserved pickup order as pay-in-store and, when Square is connected,
 * mints a hosted payment-link URL the shopper can scan as a QR.
 */
final readonly class PayInStoreFinalizer
{
    public function __construct(
        private CheckoutGatewayInterface $checkoutGateway,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return array<string, mixed> extra JSON fields to merge into the order payload
     */
    public function finalize(Store $store, Order $order): array
    {
        $order->setNotes(Order::NOTE_PAY_IN_STORE);

        $amountDue = $order->getTotalCents() - $order->getCreditAppliedCents();
        if ($amountDue <= 0 || !$this->checkoutGateway->isReady($store)) {
            return [];
        }

        $lineItems = [];
        foreach ($order->getLines() as $line) {
            if (!$line instanceof OrderLine) {
                continue;
            }
            $lineItems[] = [
                'name' => $line->getCardName(),
                'quantity' => $line->getQuantity(),
                'priceCents' => $line->getPriceCents(),
            ];
        }

        try {
            $link = $this->checkoutGateway->createPaymentLink(
                $store,
                $amountDue,
                $order->getReference().'-link',
                $order->getReference(),
                $lineItems,
                $order->getCreditAppliedCents(),
                $order->getCustomerEmail(),
                $order->getCustomerName(),
                $order->getFulfillment(),
                Order::NOTE_PAY_IN_STORE.' — '.$order->getReference(),
            );
        } catch (\RuntimeException $e) {
            $this->logger->warning('Square payment link could not be created for pay-in-store order', [
                'store' => $store->getSlug(),
                'order' => $order->getReference(),
                'error' => $e->getMessage(),
            ]);

            return [];
        }

        if (null !== $link['squareOrderId'] && null === $order->getSquareOrderId()) {
            $order->setSquareOrderId($link['squareOrderId']);
        }

        return ['paymentUrl' => $link['url']];
    }
}
