<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;

/**
 * Writes Square location tax onto pickup orders that never went through card
 * checkout (kiosk, staff-entered, pay-in-store). Online card/PayPal captures
 * already store tax from CreateOrder — those stay locked.
 */
final readonly class PickupOrderTaxSync
{
    public function __construct(
        private CheckoutGatewayInterface $checkoutGateway,
    ) {
    }

    /**
     * Quote location tax for the order lines and persist it when tax is still
     * open to refresh. Returns the tax cents on the order afterward.
     */
    public function sync(Store $store, Order $order): int
    {
        if ($this->taxIsLocked($order)) {
            return $order->getTaxCents();
        }

        $lineItems = $this->lineItems($order);
        if ([] === $lineItems) {
            $order->setTaxCents(0);

            return 0;
        }

        $quote = $this->checkoutGateway->quotePickupTotals(
            $store,
            $lineItems,
            $order->getCreditAppliedCents(),
        );
        $order->setTaxCents((int) ($quote['taxCents'] ?? 0));

        return $order->getTaxCents();
    }

    /**
     * Captured online payments keep the tax that Square charged. Estimated
     * counter tax on kiosk / pay-in-store / unpaid orders can refresh.
     */
    private function taxIsLocked(Order $order): bool
    {
        if ($order->getPaidCents() < 1) {
            return false;
        }

        if (Order::CHANNEL_KIOSK === $order->getChannel()) {
            return false;
        }

        if (Order::NOTE_PAY_IN_STORE === $order->getNotes()) {
            return false;
        }

        return null !== $order->getPaymentProvider() && '' !== $order->getPaymentProvider();
    }

    /**
     * @return list<array{name: string, quantity: int, priceCents: int}>
     */
    private function lineItems(Order $order): array
    {
        $items = [];
        foreach ($order->getLines() as $line) {
            if (!$line instanceof OrderLine) {
                continue;
            }
            $items[] = [
                'name' => $line->getCardName(),
                'quantity' => $line->getQuantity(),
                'priceCents' => $line->getPriceCents(),
            ];
        }

        return $items;
    }
}
