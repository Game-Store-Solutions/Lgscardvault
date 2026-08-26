<?php

namespace App\Tests\Service;

use App\Entity\Order;
use App\Entity\Store;
use App\Service\Billing\PlatformFeeRecorder;
use App\Service\Onboarding\PlanCatalog;
use App\Tests\Support\CatalogFixtures;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class PlatformFeeRecorderTest extends KernelTestCase
{
    public function testUsagePlanAccruesFeesUntilCap(): void
    {
        self::bootKernel();
        $em = static::getContainer()->get('doctrine')->getManager();
        $fixtures = new CatalogFixtures($em);
        $recorder = static::getContainer()->get(PlatformFeeRecorder::class);

        $store = $fixtures->store();
        $store->setPlanKey('usage')->setIsActive(true);
        $order = (new Order())
            ->setStore($store)
            ->setReference('ORD-FEE-1')
            ->setTotalCents(10_000)
            ->setPaidCents(10_000);
        $em->flush();

        $recorder->recordFromOrder($order);
        self::assertSame(500, $store->getPlatformFeesPaidCents());

        $order->setPaidCents(900_000);
        $recorder->recordFromOrder($order);
        self::assertTrue($store->hasMetPlatformCap());
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $store->getPlatformFeesPaidCents());
    }
}
