<?php

namespace App\Service\Tcgcsv;

use App\Entity\CatalogSyncRun;
use App\Entity\Game;
use App\Repository\GameRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Runs one catalog sync with bookkeeping: resolves the game, records a
 * CatalogSyncRun (running → succeeded/failed with counters or the error),
 * and never lets a failure escape as an unrecorded crash. Both the CLI
 * command and the messenger handler go through here so the Sync Jobs view
 * sees every run regardless of how it was started.
 */
final readonly class CatalogSyncRunner
{
    public function __construct(
        private CatalogSynchronizer $synchronizer,
        private GameRepository $gameRepository,
        private EntityManagerInterface $entityManager,
        private LoggerInterface $logger,
    ) {
    }

    public function run(string $gameCode): CatalogSyncRun
    {
        $game = $this->gameRepository->findOneByCode($gameCode);
        if (!$game instanceof Game) {
            throw new \InvalidArgumentException(sprintf('Unknown game "%s".', $gameCode));
        }

        $run = new CatalogSyncRun();
        $run->setGame($game);
        $this->entityManager->persist($run);
        $this->entityManager->flush();

        try {
            $summary = $this->synchronizer->sync($game);
            $run->setStatus(CatalogSyncRun::STATUS_SUCCEEDED);
            $run->setSummary($summary);
        } catch (\Throwable $e) {
            $this->logger->error('TCGCSV sync failed for {game}: {error}', [
                'game' => $game->getCode(),
                'error' => $e->getMessage(),
            ]);
            $run->setStatus(CatalogSyncRun::STATUS_FAILED);
            $run->setError($e->getMessage());
        }

        $run->setFinishedAt(new \DateTimeImmutable());
        $this->entityManager->flush();

        return $run;
    }
}
