<?php

namespace App\Service\Pricing;

use App\Entity\Card;
use App\Repository\CardRepository;
use App\Service\Scryfall\ScryfallClient;
use Psr\Log\LoggerInterface;

/**
 * Resolves a card's market price in cents, healing missing data instead of
 * giving up. The chain:
 *
 *   1. the prices already stored on the printing (Scryfall bulk sync);
 *   2. a live Scryfall refresh of that printing (persisted, so every later
 *      read — storefront tiles included — sees the healed price);
 *   3. any priced printing of the same card name in the catalog.
 *
 * MTGJSON's per-set files carry identifiers but no market prices, so the
 * cross-printing step is how the MTGJSON-matched catalog contributes a
 * price when Scryfall has none for the exact printing.
 */
final class MarketPriceResolver
{
    public function __construct(
        private readonly CardRepository $cards,
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
        if (null !== $refreshed) {
            $cents = $this->fromPrices($refreshed->getPrices(), $isFoil);
            if (null !== $cents) {
                return $cents;
            }
        }

        foreach ($this->cards->findPricedPrintingsByName($card->getName()) as $printing) {
            $cents = $this->fromPrices($printing->getPrices(), $isFoil);
            if (null !== $cents) {
                return $cents;
            }
        }

        return null;
    }

    /**
     * The card with prices present when obtainable — refreshed from Scryfall
     * (and persisted) when the stored printing is unpriced. Callers that
     * serialize the card afterwards get the healed entity.
     */
    public function ensurePriced(Card $card): Card
    {
        if (null !== $this->fromPrices($card->getPrices(), false) || null !== $this->fromPrices($card->getPrices(), true)) {
            return $card;
        }

        return $this->refresh($card) ?? $card;
    }

    private function refresh(Card $card): ?Card
    {
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
        $raw ??= $prices[$isFoil ? 'usd' : 'usd_foil'] ?? null;
        if (!is_numeric($raw)) {
            return null;
        }

        return (int) round(((float) $raw) * 100);
    }
}
