<?php

namespace App\MessageHandler;

use App\Entity\CatalogSyncRun;
use App\Message\SyncGameCatalogMessage;
use App\Service\Tcgcsv\CatalogSyncRunner;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

/**
 * Worker-side entry point for TCGCSV catalog syncs. Failures are captured
 * on the CatalogSyncRun record (visible in the Sync Jobs view) rather than
 * rethrown — retrying a full catalog sync against a once-daily mirror only
 * repeats the same result and would litter duplicate failed runs.
 */
#[AsMessageHandler]
final readonly class SyncGameCatalogMessageHandler
{
    public function __construct(
        private CatalogSyncRunner $runner,
        private LoggerInterface $logger,
    ) {
    }

    public function __invoke(SyncGameCatalogMessage $message): void
    {
        $run = $this->runner->run($message->gameCode);

        $this->logger->info('Catalog sync {status} for {game}.', [
            'status' => $run->getStatus(),
            'game' => $message->gameCode,
            'summary' => $run->getSummary(),
        ]);

        if (CatalogSyncRun::STATUS_FAILED === $run->getStatus()) {
            $this->logger->error('Catalog sync failed for {game}: {error}', [
                'game' => $message->gameCode,
                'error' => $run->getError(),
            ]);
        }
    }
}
