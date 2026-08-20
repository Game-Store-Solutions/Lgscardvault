<?php

namespace App\MessageHandler;

use App\Message\PruneReferenceDecksMessage;
use App\Service\Recommend\Intelligence\ReferenceDeckPruner;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
final class PruneReferenceDecksMessageHandler
{
    public function __construct(
        private readonly ReferenceDeckPruner $pruner,
    ) {
    }

    public function __invoke(PruneReferenceDecksMessage $message): void
    {
        $this->pruner->prune($message->batchSize);
    }
}
