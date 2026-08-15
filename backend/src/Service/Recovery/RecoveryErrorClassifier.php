<?php

namespace App\Service\Recovery;

/**
 * Buckets a row's free-text error into a short, stable label.
 *
 * A 500-row import usually fails for three or four reasons, not 500. Grouping
 * turns an intimidating wall of rows into "No market price (42)" and lets the
 * operator fix a whole class of problem at once.
 */
final class RecoveryErrorClassifier
{
    public const NO_MARKET_PRICE = 'No market price';
    public const ONLINE_ONLY = 'Online-only printing';
    public const NO_MATCH = 'No catalog match';
    public const BAD_QUANTITY = 'Invalid quantity';
    public const WRONG_GAME = 'Wrong game';
    public const OTHER = 'Other';

    public function classify(?string $error): string
    {
        $error = strtolower(trim((string) $error));
        if ('' === $error) {
            return self::OTHER;
        }

        return match (true) {
            str_contains($error, 'market price') => self::NO_MARKET_PRICE,
            str_contains($error, 'online-only') || str_contains($error, 'alchemy') => self::ONLINE_ONLY,
            str_contains($error, 'quantity') => self::BAD_QUANTITY,
            str_contains($error, 'not from this import') => self::WRONG_GAME,
            str_contains($error, 'no matching') || str_contains($error, 'no match')
                || str_contains($error, 'not found') || str_contains($error, 'catalog match') => self::NO_MATCH,
            default => self::OTHER,
        };
    }
}
