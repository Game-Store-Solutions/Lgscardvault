<?php

namespace App\Scheduler;

use App\Message\ChargeDueSubscriptionsMessage;
use App\Message\SettlePlatformDailyFeesMessage;
use Symfony\Component\Scheduler\Attribute\AsSchedule;
use Symfony\Component\Scheduler\RecurringMessage;
use Symfony\Component\Scheduler\Schedule;
use Symfony\Component\Scheduler\ScheduleProviderInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Collects subscription renewals and nightly usage-plan platform fees.
 *
 * Subscription renewals run in the small hours so a decline is waiting for the
 * owner in the morning rather than arriving mid-trading. Usage-plan platform
 * fees settle just after midnight Pacific on each closed business day.
 *
 * Run it with:
 *   php bin/console messenger:consume scheduler_billing
 */
#[AsSchedule('billing')]
final readonly class BillingSchedule implements ScheduleProviderInterface
{
    private const SUBSCRIPTION_RUN_TIME = '03:15 UTC';

    /** Usage-plan platform fee: 10% of the prior business day's shopper sales. */
    private const PLATFORM_FEE_RUN_TIME = '00:05 America/Los_Angeles';

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
                from: new \DateTimeImmutable(self::SUBSCRIPTION_RUN_TIME),
            ))
            ->add(RecurringMessage::every(
                '1 day',
                new SettlePlatformDailyFeesMessage(),
                from: new \DateTimeImmutable(self::PLATFORM_FEE_RUN_TIME),
            ));
    }
}
