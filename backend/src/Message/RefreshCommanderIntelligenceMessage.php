<?php

namespace App\Message;

/**
 * Rebuild reference-deck statistics for one commander.
 *
 * Carries the commander's card id rather than the entity so the payload stays
 * serializable and the handler always reads current catalog data.
 */
final class RefreshCommanderIntelligenceMessage
{
    public function __construct(
        public readonly string $commanderCardId,
    ) {
    }
}
