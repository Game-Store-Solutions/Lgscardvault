<?php

namespace App\MessageHandler;

use App\Entity\Card;
use App\Message\RefreshCommanderIntelligenceMessage;
use App\Repository\CardRepository;
use App\Service\Recommend\Intelligence\CommanderIntelligenceRefresher;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
final class RefreshCommanderIntelligenceMessageHandler
{
    public function __construct(
        private readonly CardRepository $cards,
        private readonly CommanderIntelligenceRefresher $refresher,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(RefreshCommanderIntelligenceMessage $message): void
    {
        $commander = $this->cards->findOneMagicById($message->commanderCardId);
        if (!$commander instanceof Card) {
            // The card was removed between enqueue and consume. Nothing to do,
            // and retrying would never succeed.
            $this->logger->warning('Commander {id} not found; skipping intelligence refresh.', [
                'id' => $message->commanderCardId,
            ]);

            return;
        }

        $this->refresher->refresh($commander);
    }
}
