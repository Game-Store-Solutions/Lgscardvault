<?php

namespace App\Service\Pricing;

use App\Entity\Card;
use App\Service\Scryfall\ScryfallClient;
use Psr\Log\LoggerInterface;

/**
 * Resolves a card's market price in cents, healing missing data instead of
 * giving up: the prices already stored on the printing (Scryfall bulk
 * sync), then a live Scryfall refresh of that printing — persisted, so
 * every later read (storefront tiles included) sees the healed price.
 */
final class MarketPriceResolver implements MarketPriceSource
{
    public function __construct(
        private readonly ScryfallClient $scryfall,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function marketPriceCents(Card $card, bool $isFoil): ?int
    {
        $cents = $this->fromPrices($card->getPrices(), $isFoil);
        if (null !== $cents) {
            return $cents;
        }

        $refreshed = $this->refresh($card);

        return null !== $refreshed ? $this->fromPrices($refreshed->getPrices(), $isFoil) : null;
    }

    /**
     * The card with prices present when obtainable — refreshed from Scryfall
     * (and persisted) when the stored printing is unpriced. Callers that
     * serialize the card afterwards get the healed entity.
     */
    public function ensurePriced(Card $card): Card
    {
        if (null !== $this->fromPrices($card->getPrices(), false)
            || null !== $this->fromPrices($card->getPrices(), true)
        ) {
            return $card;
        }

        return $this->refresh($card) ?? $card;
    }

    private function refresh(Card $card): ?Card
    {
        // Scryfall can only heal Magic printings. For TCGCSV-sourced games a
        // refresh is a guaranteed-miss remote call — their prices arrive with
        // the daily catalog sync instead, so an unpriced card stays unpriced.
        $game = $card->getGame();
        if (null !== $game && !$game->isMtg()) {
            return null;
        }

        $id = $card->getId();
        if (null === $id) {
            return null;
        }
        try {
            return $this->scryfall->fetchCardById($id);
        } catch (\Throwable $error) {
            $this->logger->warning('Market price refresh failed for card {id}: {error}', [
                'id' => (string) $id,
                'error' => $error->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * USD price for a finish in cents, with cross-finish fallback so
     * foil-only printings still resolve either way.
     *
     * @param array<string, mixed>|null $prices
     */
    private function fromPrices(?array $prices, bool $isFoil): ?int
    {
        $prices ??= [];
        $raw = $prices[$isFoil ? 'usd_foil' : 'usd'] ?? null;
        $raw ??= $prices['usd_etched'] ?? null;
        $raw ??= $prices[$isFoil ? 'usd' : 'usd_foil'] ?? null;
        if (!is_numeric($raw)) {
            return null;
        }

        $cents = (int) round(((float) $raw) * 100);

        // Scryfall stores "0.00" / null-equivalents for unpriced digital and
        // obscure printings — treat that as missing, not a free card.
        return $cents > 0 ? $cents : null;
    }
}
