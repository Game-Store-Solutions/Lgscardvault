<?php

namespace App\Service\Tcgcsv;

use App\Entity\CatalogSyncRun;
use App\Entity\Game;
use App\Repository\CatalogSyncRunRepository;
use App\Repository\GameRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Runs one catalog sync with bookkeeping: resolves the game, records a
 * CatalogSyncRun (running → succeeded/failed with counters or the error),
 * and never lets a failure escape as an unrecorded crash. Both the CLI
 * command and the messenger handler go through here so the Sync Jobs view
 * sees every run regardless of how it was started.
 *
 * The run is kept alive with a heartbeat while the sync works, because a
 * process that dies outright (out of memory, container restart) cannot
 * record its own failure — see failStaleRuns().
 */
final readonly class CatalogSyncRunner
{
    /** How often the run row is refreshed while a sync is in progress. */
    private const HEARTBEAT_INTERVAL_SECONDS = 15;

    /** No heartbeat for this long means the worker is gone. */
    public const STALE_AFTER_SECONDS = 900;

    public function __construct(
        private CatalogSynchronizer $synchronizer,
        private GameRepository $gameRepository,
        private CatalogSyncRunRepository $syncRuns,
        private EntityManagerInterface $entityManager,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @param int|null                                                 $maxGroups  bound the run to N groups (smoke runs); null = full catalog
     * @param (callable(string, int, array<string, mixed>): void)|null $onProgress receives (group name, groups done, counters)
     */
    public function run(string $gameCode, ?int $maxGroups = null, ?callable $onProgress = null): CatalogSyncRun
    {
        $game = $this->gameRepository->findOneByCode($gameCode);
        if (!$game instanceof Game) {
            throw new \InvalidArgumentException(sprintf('Unknown game "%s".', $gameCode));
        }

        // Close out anything a previous crash left hanging, so the Sync Jobs
        // view never shows two runs "in progress" for one game.
        $this->failStaleRuns();

        $run = new CatalogSyncRun();
        $run->setGame($game);
        $run->beat();
        $this->entityManager->persist($run);
        $this->entityManager->flush();
        $runId = (int) $run->getId();

        try {
            $summary = $this->synchronizer->sync($game, $maxGroups, $this->heartbeat($runId, $onProgress));
            $run = $this->reloadRun($runId);
            $run->setStatus(CatalogSyncRun::STATUS_SUCCEEDED);
            $run->setSummary($summary);
        } catch (\Throwable $e) {
            $this->logger->error('TCGCSV sync failed for {game}: {error}', [
                'game' => $gameCode,
                'error' => $e->getMessage(),
            ]);
            $run = $this->reloadRun($runId);
            $run->setStatus(CatalogSyncRun::STATUS_FAILED);
            $run->setError($e->getMessage());
        }

        $run->setFinishedAt(new \DateTimeImmutable());
        $this->entityManager->flush();

        return $run;
    }

    /**
     * Marks runs whose worker went away as failed. Safe to call from read
     * paths (the Sync Jobs listing) so the view heals itself.
     *
     * @return int number of runs reaped
     */
    public function failStaleRuns(): int
    {
        return $this->syncRuns->failStaleRuns(
            new \DateTimeImmutable(sprintf('-%d seconds', self::STALE_AFTER_SECONDS)),
        );
    }

    /**
     * Wraps the caller's progress callback with a throttled heartbeat, so a
     * long sync keeps proving it is alive (and shows live counters) without
     * an extra write per set.
     *
     * @param (callable(string, int, array<string, mixed>): void)|null $onProgress
     *
     * @return callable(string, int, array<string, mixed>): void
     */
    private function heartbeat(int $runId, ?callable $onProgress): callable
    {
        $lastBeat = 0.0;

        return function (string $group, int $done, array $counters) use ($runId, $onProgress, &$lastBeat): void {
            if (null !== $onProgress) {
                $onProgress($group, $done, $counters);
            }

            $now = microtime(true);
            if ($now - $lastBeat < self::HEARTBEAT_INTERVAL_SECONDS) {
                return;
            }
            $lastBeat = $now;

            // The synchronizer clears the entity manager between sets, so the
            // run has to be re-read rather than held across the whole sync.
            $run = $this->reloadRun($runId);
            $run->beat();
            $run->setSummary($counters);
            $this->entityManager->flush();
        };
    }

    private function reloadRun(int $runId): CatalogSyncRun
    {
        $run = $this->syncRuns->find($runId);
        if (!$run instanceof CatalogSyncRun) {
            throw new \RuntimeException(sprintf('Catalog sync run %d disappeared mid-run.', $runId));
        }

        return $run;
    }
}
