<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;
use Psr\Log\LoggerInterface;

/**
 * Stamps a reserved pickup order as pay-in-store and, when Square is connected,
 * publishes a Square invoice so staff can collect it from Invoices on the
 * register. Falls back to a hosted payment-link URL when invoices are unavailable.
 */
final readonly class PayInStoreFinalizer
{
    public function __construct(
        private CheckoutGatewayInterface $checkoutGateway,
        private PickupOrderTaxSync $pickupOrderTaxSync,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return array<string, mixed> extra JSON fields to merge into the order payload
     */
    public function finalize(Store $store, Order $order): array
    {
        $order->setNotes(Order::NOTE_PAY_IN_STORE);
        $this->pickupOrderTaxSync->sync($store, $order);

        return $this->syncSquareCollect($store, $order);
    }

    /**
     * Rebuild the Square invoice after staff change lines on an unpaid reserve.
     * Keep the existing invoice ids if Square cannot cancel — staff still have
     * a collect path rather than a dangling canceled pointer.
     */
    public function refresh(Store $store, Order $order): void
    {
        if (!$order->isUnpaidPayInStore()) {
            return;
        }

        $invoiceId = $order->getSquareInvoiceId();
        if (null !== $invoiceId && '' !== $invoiceId) {
            try {
                $this->checkoutGateway->cancelInvoice($store, $invoiceId);
            } catch (\RuntimeException $e) {
                $this->logger->warning('Square pay-in-store invoice could not be canceled; keeping current invoice', [
                    'store' => $store->getSlug(),
                    'order' => $order->getReference(),
                    'invoice' => $invoiceId,
                    'error' => $e->getMessage(),
                ]);

                return;
            }

            $order->setSquareInvoiceId(null)->setSquareInvoiceUrl(null)->setSquareOrderId(null);
        }

        $this->syncSquareCollect($store, $order);
    }

    /** Remove an unpaid invoice from Square POS when staff cancel the LGS order. */
    public function cancelRemote(Store $store, Order $order): void
    {
        if ($order->getPaidCents() > 0) {
            return;
        }

        $invoiceId = $order->getSquareInvoiceId();
        if (null === $invoiceId || '' === $invoiceId) {
            return;
        }

        try {
            $this->checkoutGateway->cancelInvoice($store, $invoiceId);
        } catch (\RuntimeException $e) {
            $this->logger->warning('Square pay-in-store invoice could not be canceled', [
                'store' => $store->getSlug(),
                'order' => $order->getReference(),
                'invoice' => $invoiceId,
                'error' => $e->getMessage(),
            ]);
        }

        $order->setSquareInvoiceId(null)->setSquareInvoiceUrl(null)->setSquareOrderId(null);
    }

    /**
     * @return array<string, mixed>
     */
    private function syncSquareCollect(Store $store, Order $order): array
    {
        $amountDue = $order->amountDueCents();
        if ($amountDue <= 0 || !$this->checkoutGateway->isReady($store)) {
            return [];
        }

        $lineItems = $this->lineItems($order);
        $email = trim((string) $order->getCustomerEmail());

        if ('' !== $email) {
            try {
                $invoice = $this->checkoutGateway->createPayInStoreInvoice(
                    $store,
                    $order->getReference().'-inv-'.bin2hex(random_bytes(3)),
                    $order->getReference(),
                    $lineItems,
                    $order->getCreditAppliedCents(),
                    $email,
                    $order->getCustomerName(),
                    $order->getFulfillment(),
                );
                $order->setSquareOrderId($invoice['squareOrderId'])
                    ->setSquareInvoiceId($invoice['squareInvoiceId'])
                    ->setSquareInvoiceUrl($invoice['url']);

                return array_filter([
                    'paymentUrl' => $invoice['url'],
                    'squareInvoiceId' => $invoice['squareInvoiceId'],
                    'squareInvoiceUrl' => $invoice['url'],
                ], static fn (mixed $v): bool => null !== $v && '' !== $v);
            } catch (\RuntimeException $e) {
                $this->logger->warning('Square invoice could not be created for pay-in-store order: '.$e->getMessage(), [
                    'store' => $store->getSlug(),
                    'order' => $order->getReference(),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $this->createPaymentLinkFallback($store, $order, $lineItems, $amountDue);
    }

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array<string, mixed>
     */
    private function createPaymentLinkFallback(Store $store, Order $order, array $lineItems, int $amountDue): array
    {
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
            $this->logger->warning('Square payment link could not be created for pay-in-store order: '.$e->getMessage(), [
                'store' => $store->getSlug(),
                'order' => $order->getReference(),
                'error' => $e->getMessage(),
            ]);

            return [];
        }

        if (null !== $link['squareOrderId']) {
            $order->setSquareOrderId($link['squareOrderId']);
        }

        return ['paymentUrl' => $link['url']];
    }

    /**
     * @return list<array{name: string, quantity: int, priceCents: int}>
     */
    private function lineItems(Order $order): array
    {
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

        return $lineItems;
    }
}
