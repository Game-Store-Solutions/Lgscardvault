<?php

namespace App\Message;

/**
 * Queues a TCGCSV catalog sync for one game (sets + cards + sealed +
 * prices). Dispatched by the platform admin Sync Jobs UI and by scheduled
 * jobs; handled on the async messenger transport because a full game sync
 * makes hundreds of catalog requests.
 */
final readonly class SyncGameCatalogMessage
{
    public function __construct(
        public string $gameCode,
    ) {
    }
}
