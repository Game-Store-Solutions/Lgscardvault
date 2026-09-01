<?php

namespace App\Tests\Service;

use App\Entity\Store;
use App\Service\Billing\PlatformFeeCalculator;
use App\Service\Onboarding\PlanCatalog;
use PHPUnit\Framework\TestCase;

final class PlatformFeeCalculatorTest extends TestCase
{
    private PlatformFeeCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new PlatformFeeCalculator(new PlanCatalog());
    }

    public function testUsagePlanDoesNotSplitFeesAtCapture(): void
    {
        $store = (new Store())->setPlanKey('usage');

        self::assertSame(0, $this->calculator->feeDueForCapture($store, 10_000));
    }

    public function testUsagePlanChargesTenPercentOfDailyGrossUntilCap(): void
    {
        $store = (new Store())->setPlanKey('usage');

        self::assertSame(1000, $this->calculator->feeDueForDailyGross($store, 10_000));
    }

    public function testFlatPlanNeverChargesFee(): void
    {
        $store = (new Store())->setPlanKey('flat');

        self::assertSame(0, $this->calculator->feeDueForDailyGross($store, 10_000));
    }

    public function testCapReachedReturnsZero(): void
    {
        $store = (new Store())
            ->setPlanKey('usage');
        $store->markPlatformCapReached();

        self::assertSame(0, $this->calculator->feeDueForDailyGross($store, 10_000));
    }

    public function testRemainingCapClampsFee(): void
    {
        $store = (new Store())->setPlanKey('usage');
        $store->addPlatformFeesPaid(PlanCatalog::PLATFORM_CAP_CENTS - 100);

        self::assertSame(100, $this->calculator->feeDueForDailyGross($store, 10_000));
    }
}
