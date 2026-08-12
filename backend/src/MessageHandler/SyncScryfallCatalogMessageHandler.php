<?php

namespace App\MessageHandler;

use App\Message\SyncScryfallCatalogMessage;
use App\Service\Scryfall\ScryfallSyncRunner;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

/**
 * Runs a Scryfall bulk sync in the worker and updates the matching
 * {@see \App\Entity\ScryfallSyncRun} for the Sync Jobs UI.
 *
 * Shares the `async` transport with CSV imports — a long default_cards sync
 * occupies one worker for its duration.
 */
#[AsMessageHandler]
final readonly class SyncScryfallCatalogMessageHandler
{
    public function __construct(
        private ScryfallSyncRunner $runner,
    ) {
    }

    public function __invoke(SyncScryfallCatalogMessage $message): void
    {
        $this->runner->run($message->runId);
    }
}
