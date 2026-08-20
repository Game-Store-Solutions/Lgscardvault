<?php

namespace App\MessageHandler;

use App\Entity\Card;
use App\Message\RefreshCommanderIntelligenceMessage;
use App\Message\RefreshStaleCommanderIntelligenceMessage;
use App\Repository\CommanderRepository;
use App\Repository\CommanderStrategyStatRepository;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsMessageHandler]
final class RefreshStaleCommanderIntelligenceMessageHandler
{
    /**
     * Commanders scanned per sweep. Larger than the batch size because most
     * candidates will already be fresh and get skipped without any work.
     */
    private const SCAN_LIMIT = 1000;

    public function __construct(
        private readonly CommanderRepository $commanders,
        private readonly CommanderStrategyStatRepository $strategyStats,
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
        private readonly int $maxAgeDays = 90,
    ) {
    }

    public function __invoke(RefreshStaleCommanderIntelligenceMessage $message): void
    {
        $cutoff = new \DateTimeImmutable(sprintf('-%d days', max(1, $this->maxAgeDays)));
        $budget = max(1, $message->batchSize);
        $queued = 0;

        foreach ($this->commanders->findMostPlayed(self::SCAN_LIMIT) as $commander) {
            if ($queued >= $budget) {
                break;
            }
            $card = $commander->getCard();
            if (!$card instanceof Card) {
                continue;
            }

            $lastUpdated = $this->strategyStats->lastUpdatedAt($commander->getOracleId());
            if (null !== $lastUpdated && $lastUpdated > $cutoff) {
                continue;
            }

            $this->bus->dispatch(new RefreshCommanderIntelligenceMessage((string) $card->getId()));
            ++$queued;
        }

        $this->logger->info('Queued {count} stale commander intelligence refresh job(s).', ['count' => $queued]);
    }
}
