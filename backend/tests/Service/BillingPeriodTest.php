<?php

namespace App\Tests\Service;

use App\Service\Billing\BillingPeriod;
use PHPUnit\Framework\TestCase;

final class BillingPeriodTest extends TestCase
{
    public function testEndOfMonthContaining(): void
    {
        $mid = new \DateTimeImmutable('2026-09-15 12:00:00', BillingPeriod::timezone());
        $end = BillingPeriod::endOfMonthContaining($mid);

        self::assertSame('2026-09-30', $end->format('Y-m-d'));
        self::assertSame('23:59:59', $end->format('H:i:s'));
    }

    public function testWholeDaysUntil(): void
    {
        $now = new \DateTimeImmutable('2026-09-01 10:00:00', BillingPeriod::timezone());
        $end = new \DateTimeImmutable('2026-09-08 23:59:59', BillingPeriod::timezone());

        self::assertSame(7, BillingPeriod::wholeDaysUntil($end, $now));
    }
}
