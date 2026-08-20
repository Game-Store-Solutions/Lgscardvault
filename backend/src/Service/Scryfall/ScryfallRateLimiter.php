<?php

namespace App\Service\Scryfall;

use App\Service\Http\FileLockRateLimiter;

/**
 * Cross-process rate limiter for outbound Scryfall requests, holding us under
 * their ~10 req/s guideline no matter how many workers are running.
 *
 * See FileLockRateLimiter for the locking mechanics.
 */
final class ScryfallRateLimiter extends FileLockRateLimiter
{
    private const DEFAULT_MIN_INTERVAL_MICROSECONDS = 125000; // 8 req/s

    public function __construct(
        string $lockFilePath = '',
        int $minIntervalMicroseconds = self::DEFAULT_MIN_INTERVAL_MICROSECONDS,
    ) {
        parent::__construct($lockFilePath, $minIntervalMicroseconds, 'mtgstore_scryfall_rate.lock');
    }
}
