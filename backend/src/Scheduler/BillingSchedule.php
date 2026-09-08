<?php

namespace App\Scheduler;

use App\Message\ChargeDueSubscriptionsMessage;
use App\Message\ClosePlatformBillingPeriodsMessage;
use App\Message\SettlePlatformDailyFeesMessage;
use Symfony\Component\Scheduler\Attribute\AsSchedule;
use Symfony\Component\Scheduler\RecurringMessage;
use Symfony\Component\Scheduler\Schedule;
use Symfony\Component\Scheduler\ScheduleProviderInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Collects subscription renewals, nightly usage-plan platform fees, and
 * monthly period warnings / remainder charges.
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

    /** Warn -7/-3/-1 and close months just after daily fee settlement. */
    private const MONTHLY_CLOSE_RUN_TIME = '00:15 America/Los_Angeles';

    public function __construct(private CacheInterface $cache)
    {
    }

    public function getSchedule(): Schedule
    {
        return (new Schedule())
            ->stateful($this->cache)
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
            ))
            ->add(RecurringMessage::every(
                '1 day',
                new ClosePlatformBillingPeriodsMessage(),
                from: new \DateTimeImmutable(self::MONTHLY_CLOSE_RUN_TIME),
            ));
    }
}
