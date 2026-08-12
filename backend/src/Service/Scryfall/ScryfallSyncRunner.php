<?php

namespace App\Service\Scryfall;

use App\Entity\ScryfallSyncRun;
use App\Repository\ScryfallSyncRunRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Owns the Scryfall sync lifecycle on a {@see ScryfallSyncRun} row so the
 * Sync Jobs UI can show progress / outcome the same way TCGCSV does.
 */
final readonly class ScryfallSyncRunner
{
    /** No heartbeat for this long means a running worker is gone. */
    public const STALE_RUNNING_AFTER_SECONDS = 900;

    /** Queued too long without pickup (workers busy / down). */
    public const STALE_QUEUED_AFTER_SECONDS = 21600;

    public function __construct(
        private ScryfallClient $scryfallClient,
        private ScryfallSyncRunRepository $runs,
        private EntityManagerInterface $entityManager,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return array{inserted: int, updated: int, total: int}
     */
    public function run(int $runId): array
    {
        $this->failStaleRuns();

        $run = $this->runs->find($runId);
        if (!$run instanceof ScryfallSyncRun) {
            throw new \InvalidArgumentException(sprintf('Unknown Scryfall sync run %d.', $runId));
        }

        $run->setStatus(ScryfallSyncRun::STATUS_RUNNING);
        $run->beat();
        $this->entityManager->flush();

        $type = $run->getBulkType();
        $this->logger->info('Scryfall bulk sync started ({type}, run {id}).', [
            'type' => $type,
            'id' => $runId,
        ]);

        try {
            $lastBeatAt = 0;
            $result = $this->scryfallClient->syncBulkCards(function (int $processed) use ($runId, &$lastBeatAt): void {
                $now = time();
                if ($now - $lastBeatAt < 15) {
                    return;
                }
                $lastBeatAt = $now;
                $run = $this->runs->find($runId);
                if ($run instanceof ScryfallSyncRun) {
                    $run->beat();
                    $run->setSummary(['processed' => $processed]);
                    $this->entityManager->flush();
                }
            }, $type);


            $run = $this->runs->find($runId);
            if (!$run instanceof ScryfallSyncRun) {
                return $result;
            }

            $run->setStatus(ScryfallSyncRun::STATUS_SUCCEEDED);
            $run->setSummary([
                'inserted' => $result['inserted'],
                'updated' => $result['updated'],
                'total' => $result['total'],
                'processed' => $result['total'],
            ]);
            $run->setFinishedAt(new \DateTimeImmutable());
            $run->beat();
            $this->entityManager->flush();

            $this->logger->info('Scryfall bulk sync finished ({type}): {inserted} inserted, {updated} updated, {total} processed.', [
                'type' => $type,
                'inserted' => $result['inserted'],
                'updated' => $result['updated'],
                'total' => $result['total'],
            ]);

            return $result;
        } catch (\Throwable $e) {
            $this->logger->error('Scryfall bulk sync failed ({type}): {error}', [
                'type' => $type,
                'error' => $e->getMessage(),
            ]);

            $run = $this->runs->find($runId);
            if ($run instanceof ScryfallSyncRun) {
                $run->setStatus(ScryfallSyncRun::STATUS_FAILED);
                $run->setError($e->getMessage());
                $run->setFinishedAt(new \DateTimeImmutable());
                $this->entityManager->flush();
            }

            throw $e;
        }
    }

    public function failStaleRuns(): int
    {
        $runningThreshold = (new \DateTimeImmutable())->modify(sprintf('-%d seconds', self::STALE_RUNNING_AFTER_SECONDS));
        $queuedThreshold = (new \DateTimeImmutable())->modify(sprintf('-%d seconds', self::STALE_QUEUED_AFTER_SECONDS));

        return $this->runs->failStaleRuns($runningThreshold, $queuedThreshold);
    }

    /** @return array<string, mixed> */
    public function serialize(ScryfallSyncRun $run): array
    {
        return [
            'id' => $run->getId(),
            'source' => 'scryfall',
            'bulkType' => $run->getBulkType(),
            'label' => $this->labelForType($run->getBulkType()),
            'status' => $run->getStatus(),
            'startedAt' => $run->getStartedAt()->format(\DATE_ATOM),
            'finishedAt' => $run->getFinishedAt()?->format(\DATE_ATOM),
            'summary' => $run->getSummary(),
            'error' => $run->getError(),
        ];
    }

    private function labelForType(string $type): string
    {
        return match ($type) {
            ScryfallClient::BULK_TYPE_ORACLE => 'Scryfall · unique cards',
            ScryfallClient::BULK_TYPE_DEFAULT => 'Scryfall · all printings',
            default => 'Scryfall · '.$type,
        };
    }
}
