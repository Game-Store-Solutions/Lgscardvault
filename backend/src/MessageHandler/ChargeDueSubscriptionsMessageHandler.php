<?php

namespace App\MessageHandler;

use App\Message\ChargeDueSubscriptionsMessage;
use App\Service\Payments\SubscriptionRenewer;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
final readonly class ChargeDueSubscriptionsMessageHandler
{
    public function __construct(
        private SubscriptionRenewer $renewer,
        private LoggerInterface $logger,
    ) {
    }

    public function __invoke(ChargeDueSubscriptionsMessage $message): void
    {
        $results = $this->renewer->run();

        if ([] === $results) {
            return;
        }

        $this->logger->info('Subscription renewals processed', [
            'due' => count($results),
            'charged' => count(array_filter($results, static fn (array $r): bool => 'charged' === $r['outcome'])),
            'failed' => count(array_filter($results, static fn (array $r): bool => in_array($r['outcome'], ['declined', 'no_card'], true))),
        ]);
    }
}
