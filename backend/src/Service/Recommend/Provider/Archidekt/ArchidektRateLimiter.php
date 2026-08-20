<?php

namespace App\Service\Recommend\Provider\Archidekt;

use App\Service\Http\FileLockRateLimiter;

/**
 * Host-wide throttle for Archidekt requests.
 *
 * Archidekt publishes no rate limit, so we set a deliberately conservative one.
 * Harvesting is a background, once-per-commander job, so a slower ceiling costs
 * us nothing and keeps our footprint on someone else's infrastructure small.
 */
final class ArchidektRateLimiter extends FileLockRateLimiter
{
    private const DEFAULT_MIN_INTERVAL_MICROSECONDS = 1_000_000; // 1 req/s

    public function __construct(
        string $lockFilePath = '',
        int $minIntervalMicroseconds = self::DEFAULT_MIN_INTERVAL_MICROSECONDS,
    ) {
        parent::__construct($lockFilePath, $minIntervalMicroseconds, 'mtgstore_archidekt_rate.lock');
    }
}
