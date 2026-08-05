<?php

namespace App\Scheduler;

use App\Message\ChargeDueSubscriptionsMessage;
use Symfony\Component\Scheduler\Attribute\AsSchedule;
use Symfony\Component\Scheduler\RecurringMessage;
use Symfony\Component\Scheduler\Schedule;
use Symfony\Component\Scheduler\ScheduleProviderInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Collects subscription renewals from store owners.
 *
 * Runs in the small hours so a decline is waiting for the owner in the morning
 * rather than arriving mid-trading. Only stores whose paid period has already
 * elapsed are charged, and each attempt carries a deterministic idempotency
 * key, so running twice — or catching up after an outage — cannot double-bill.
 *
 * Run it with:
 *   php bin/console messenger:consume scheduler_billing
 */
#[AsSchedule('billing')]
final readonly class BillingSchedule implements ScheduleProviderInterface
{
    private const DAILY_RUN_TIME = '03:15 UTC';

    public function __construct(private CacheInterface $cache)
    {
    }

    public function getSchedule(): Schedule
    {
        return (new Schedule())
            // Survives restarts: a night the worker was down is still collected
            // when it comes back rather than silently skipped.
            ->stateful($this->cache)
            // Catching up on several missed nights would only re-select the
            // same due stores, so one run is enough.
            ->processOnlyLastMissedRun(true)
            ->add(RecurringMessage::every(
                '1 day',
                new ChargeDueSubscriptionsMessage(),
                from: new \DateTimeImmutable(self::DAILY_RUN_TIME),
            ));
    }
}
