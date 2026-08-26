<?php

namespace App\Tests\Service;

use App\Entity\Store;
use App\Service\Billing\PlatformFeeRecorder;
use App\Service\Onboarding\PlanCatalog;
use PHPUnit\Framework\TestCase;

final class PlatformFeeRecorderTest extends TestCase
{
    public function testUsagePlanAccruesFeesUntilCap(): void
    {
        $planCatalog = new PlanCatalog();
        $recorder = new PlatformFeeRecorder($planCatalog);
        $store = (new Store())->setPlanKey('usage')->setIsActive(true);

        $recorder->recordCollectedFee($store, 500);
        self::assertSame(500, $store->getPlatformFeesPaidCents());

        $recorder->recordCollectedFee($store, 449_500);
        self::assertTrue($store->hasMetPlatformCap());
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $store->getPlatformFeesPaidCents());
    }
}
