<?php

namespace App\Service\Catalog;

use App\Entity\Card;

/** Scryfall USD market price in cents for catalog-only recommendations. */
final class MarketPrice
{
    public static function centsFromCard(Card $card): ?int
    {
        $prices = $card->getPrices();
        if (!is_array($prices)) {
            return null;
        }

        foreach (['usd', 'usd_etched', 'usd_foil'] as $key) {
            $raw = $prices[$key] ?? null;
            if (!is_string($raw) || '' === $raw) {
                continue;
            }
            $parsed = (float) $raw;
            if ($parsed > 0) {
                return (int) round($parsed * 100);
            }
        }

        return null;
    }
}
