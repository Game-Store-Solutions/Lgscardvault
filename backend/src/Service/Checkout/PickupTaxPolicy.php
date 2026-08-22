<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\Store;
use App\Service\Onboarding\UsRegion;

/**
 * Card checkout must collect Square location tax in states that charge sales
 * tax. Stores in AK/DE/MT/NH/OR may charge $0 tax. Unknown region is not
 * blocked so admin-provisioned and test stores keep working.
 */
final class PickupTaxPolicy
{
    public const BLOCK_MESSAGE = 'Online card checkout is paused until this store enables sales tax on its Square location. Reserve and pay in store, or ask the store to turn location tax on in Square.';

    public function cardCheckoutBlockReason(Store $store, int $taxCents, int $merchandiseDueCents): ?string
    {
        if ($merchandiseDueCents <= 0 || $taxCents > 0) {
            return null;
        }
        if (!UsRegion::chargesStateSalesTax($store->getRegion())) {
            return null;
        }

        return self::BLOCK_MESSAGE;
    }

    /**
     * @param array{taxCents?: int, dueCents?: int} $quote
     *
     * @return array{
     *     subtotalCents: int,
     *     creditCents: int,
     *     taxCents: int,
     *     dueCents: int,
     *     fulfillment: string,
     *     taxNote: string,
     *     taxReady: bool,
     *     taxBlockReason: string|null
     * }
     */
    public function decorateQuote(Store $store, int $subtotalCents, int $creditCents, array $quote): array
    {
        $taxCents = (int) ($quote['taxCents'] ?? 0);
        $merchandiseDue = max(0, $subtotalCents - $creditCents);
        $block = $this->cardCheckoutBlockReason($store, $taxCents, $merchandiseDue);

        return [
            'subtotalCents' => $subtotalCents,
            'creditCents' => $creditCents,
            'taxCents' => $taxCents,
            'dueCents' => (int) ($quote['dueCents'] ?? ($merchandiseDue + $taxCents)),
            'fulfillment' => Order::FULFILLMENT_PICKUP,
            'taxNote' => $this->taxNote($store, $taxCents),
            'taxReady' => null === $block,
            'taxBlockReason' => $block,
        ];
    }

    private function taxNote(Store $store, int $taxCents): string
    {
        if (UsRegion::hasNoStateSalesTax($store->getRegion())) {
            return $taxCents > 0
                ? 'There is no statewide sales tax here. Local tax from this store\'s Square location may still appear on the charge.'
                : 'This store is in a state with no statewide sales tax. Card checkout can be completed with $0 tax.';
        }

        return 'Sales tax is charged at this store\'s location for pickup orders.';
    }
}
