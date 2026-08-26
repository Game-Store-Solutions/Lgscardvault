<?php

namespace App\Service\Checkout;

use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\PaypalCheckoutGatewayInterface;

/** Creates a PayPal order for the current cart quote without reserving stock. */
final readonly class PaypalOrderFactory
{
    public function __construct(
        private CheckoutGatewayInterface $square,
        private PaypalCheckoutGatewayInterface $paypal,
        private PickupTaxPolicy $taxPolicy,
    ) {
    }

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array{orderId: string, dueCents: int, taxCents: int}
     */
    public function create(
        Store $store,
        array $lineItems,
        int $subtotalCents,
        int $creditCents,
        string $referenceHint,
        ?string $buyerEmail,
    ): array {
        if (!$this->paypal->isReady($store)) {
            throw new \RuntimeException('This store has not connected PayPal yet.');
        }

        $quote = $this->square->quotePickupTotals($store, $lineItems, $creditCents);
        $decorated = $this->taxPolicy->decorateQuote($store, $subtotalCents, $creditCents, $quote);
        if (!$decorated['taxReady']) {
            throw new PickupTaxNotReadyException((string) ($decorated['taxBlockReason'] ?? PickupTaxPolicy::BLOCK_MESSAGE));
        }

        $due = (int) $decorated['dueCents'];
        $orderId = $this->paypal->createOrder(
            $store,
            $due,
            $referenceHint,
            $lineItems,
            $creditCents,
            $buyerEmail,
        );

        return [
            'orderId' => $orderId,
            'dueCents' => $due,
            'taxCents' => (int) $decorated['taxCents'],
        ];
    }
}
