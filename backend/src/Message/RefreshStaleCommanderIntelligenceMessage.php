<?php

namespace App\Message;

/**
 * Sweep for commanders whose reference statistics have gone stale and queue an
 * individual refresh for each.
 *
 * A fan-out message rather than a single giant job: the batch is bounded, so
 * outbound provider traffic stays predictable week to week, and one commander
 * failing never blocks the rest.
 */
final class RefreshStaleCommanderIntelligenceMessage
{
    public function __construct(
        public readonly int $batchSize = 100,
    ) {
    }
}
