<?php

namespace App\Service\Billing;

/**
 * Platform billing periods are calendar months in America/Los_Angeles
 * (same timezone as nightly usage-fee settlement).
 */
final class BillingPeriod
{
    public const TIMEZONE = PlatformDailySalesAccrual::BUSINESS_TIMEZONE;

    public static function timezone(): \DateTimeZone
    {
        return new \DateTimeZone(self::TIMEZONE);
    }

    /** Last instant of the calendar month containing $now (PT). */
    public static function endOfMonthContaining(\DateTimeImmutable $now): \DateTimeImmutable
    {
        $local = $now->setTimezone(self::timezone());

        return $local->modify('last day of this month')->setTime(23, 59, 59);
    }

    /** Last instant of the calendar month after the one containing $now (PT). */
    public static function endOfNextMonth(\DateTimeImmutable $now): \DateTimeImmutable
    {
        $local = $now->setTimezone(self::timezone());

        return $local->modify('first day of next month')
            ->modify('last day of this month')
            ->setTime(23, 59, 59);
    }

    /**
     * Whole calendar days remaining until period end (PT dates).
     * 0 when period end is today or already past.
     */
    public static function wholeDaysUntil(\DateTimeImmutable $periodEnd, \DateTimeImmutable $now): int
    {
        $tz = self::timezone();
        $endDay = $periodEnd->setTimezone($tz)->setTime(0, 0);
        $nowDay = $now->setTimezone($tz)->setTime(0, 0);
        $diff = (int) $nowDay->diff($endDay)->format('%r%a');

        return max(0, $diff);
    }
}
