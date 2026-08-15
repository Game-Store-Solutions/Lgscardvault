<?php

namespace App\Service\Catalog;

use App\Entity\Card;
use App\Service\Pricing\MarketPriceSource;

/**
 * Gates stocking a printing into store inventory: Magic online-only
 * printings are rejected, and Magic listings must resolve to a sell price
 * above $0 (explicit or market).
 */
final readonly class StockablePrintingPolicy
{
    public function __construct(
        private MarketPriceSource $marketPriceSource,
    ) {
    }

    /**
     * Why this printing must not be stocked, or null when it is stockable.
     *
     * @param int|null $explicitPriceCents seller-supplied price; when > 0 it
     *                                     satisfies the price rule even if
     *                                     market data is missing
     */
    public function rejectionReason(Card $card, bool $isFoil, ?int $explicitPriceCents = null): ?string
    {
        $game = $card->getGame();
        $isMtg = null === $game || $game->isMtg();
        if (!$isMtg) {
            return null;
        }

        $online = PaperPrinting::onlineOnlyReason($card);
        if (null !== $online) {
            return $online;
        }

        if (null !== $explicitPriceCents && $explicitPriceCents > 0) {
            return null;
        }

        $market = $this->marketPriceSource->marketPriceCents($card, $isFoil);
        if (null === $market || $market <= 0) {
            return 'No market price available for this printing (priced at $0). Pick a paper printing with a price, or set a sell price.';
        }

        return null;
    }
}
