<?php

namespace App\MessageHandler;

use App\Message\SettlePlatformDailyFeesMessage;
use App\Service\Billing\PlatformDailyFeeSettler;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
final readonly class SettlePlatformDailyFeesMessageHandler
{
    public function __construct(
        private PlatformDailyFeeSettler $settler,
        private LoggerInterface $logger,
    ) {
    }

    public function __invoke(SettlePlatformDailyFeesMessage $message): void
    {
        $results = $this->settler->run();

        if ([] === $results) {
            return;
        }

        $this->logger->info('Daily platform fee settlements processed', [
            'ledgers' => count($results),
            'charged' => count(array_filter($results, static fn (array $r): bool => 'charged' === $r['outcome'])),
            'failed' => count(array_filter($results, static fn (array $r): bool => in_array($r['outcome'], ['declined', 'no_card'], true))),
        ]);
    }
}
