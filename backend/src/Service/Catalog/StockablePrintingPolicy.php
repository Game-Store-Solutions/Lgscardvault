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
    public const NO_MARKET_PRICE = 'No market price available for this printing (priced at $0). Pick a paper printing with a price, or set a sell price.';

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
        if (!$this->isMagic($card)) {
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
            return self::NO_MARKET_PRICE;
        }

        return null;
    }

    /**
     * Recovery-search check: same rules as stocking, but using only the
     * prices already on the card. A live Scryfall refresh here would turn
     * every $0 hit into another remote round-trip.
     */
    public function storedRejectionReason(Card $card, bool $isFoil): ?string
    {
        if (!$this->isMagic($card)) {
            return null;
        }

        $online = PaperPrinting::onlineOnlyReason($card);
        if (null !== $online) {
            return $online;
        }

        $market = self::storedPriceCents($card, $isFoil);
        if (null === $market || $market <= 0) {
            return self::NO_MARKET_PRICE;
        }

        return null;
    }

    /** True when either finish has a stored sell price above $0 (and is paper). */
    public function isStoredStockable(Card $card): bool
    {
        return null === $this->storedRejectionReason($card, false)
            || null === $this->storedRejectionReason($card, true);
    }

    private function isMagic(Card $card): bool
    {
        $game = $card->getGame();

        return null === $game || $game->isMtg();
    }

    /**
     * USD cents already stored on the printing, with the same cross-finish
     * fallback MarketPriceResolver uses — but no remote heal.
     */
    public static function storedPriceCents(Card $card, bool $isFoil): ?int
    {
        $prices = $card->getPrices() ?? [];
        $raw = $prices[$isFoil ? 'usd_foil' : 'usd'] ?? null;
        $raw ??= $prices[$isFoil ? 'usd' : 'usd_foil'] ?? null;
        if (!is_numeric($raw)) {
            return null;
        }

        $cents = (int) round(((float) $raw) * 100);

        return $cents > 0 ? $cents : null;
    }
}
