<?php

namespace App\Message;

/**
 * Async trigger for a Scryfall bulk catalog sync. Dispatched by the admin
 * endpoint so the multi-minute (oracle_cards) to multi-hour (default_cards)
 * download/upsert runs in a messenger worker instead of pinning a PHP web
 * worker until the proxy kills the request.
 */
final readonly class SyncScryfallCatalogMessage
{
    public function __construct(
        public string $type,
        public int $runId,
    ) {
    }
}
