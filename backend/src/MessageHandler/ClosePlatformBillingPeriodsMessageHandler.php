<?php

namespace App\MessageHandler;

use App\Message\ClosePlatformBillingPeriodsMessage;
use App\Service\Billing\PlatformMonthlyBillingCloser;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
final readonly class ClosePlatformBillingPeriodsMessageHandler
{
    public function __construct(
        private PlatformMonthlyBillingCloser $closer,
        private LoggerInterface $logger,
    ) {
    }

    public function __invoke(ClosePlatformBillingPeriodsMessage $message): void
    {
        $results = $this->closer->run();
        if ([] === $results) {
            return;
        }

        $this->logger->info('Platform monthly billing closer finished', [
            'actions' => count($results),
            'charged' => count(array_filter($results, static fn (array $r): bool => 'charged' === $r['outcome'])),
            'warned' => count(array_filter($results, static fn (array $r): bool => 'warned' === $r['outcome'])),
            'suspended' => count(array_filter($results, static fn (array $r): bool => 'suspended' === $r['outcome'])),
        ]);
    }
}
