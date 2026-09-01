<?php

namespace App\Tests\Service;

use App\Entity\PlatformDailySalesLedger;
use App\Entity\Store;
use App\Repository\PlatformDailySalesLedgerRepository;
use App\Service\Billing\PlatformDailySalesAccrual;
use App\Service\Onboarding\PlanCatalog;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;

final class PlatformDailySalesAccrualTest extends TestCase
{
    public function testAccruesUsagePlanSalesForBusinessDay(): void
    {
        $store = (new Store())->setPlanKey('usage');
        $ledger = new PlatformDailySalesLedger($store, new \DateTimeImmutable('2026-08-30'));

        $repo = $this->createMock(PlatformDailySalesLedgerRepository::class);
        $repo->method('findForStoreAndDate')->willReturn($ledger);

        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects(self::never())->method('persist');

        $accrual = new PlatformDailySalesAccrual(new PlanCatalog(), $repo, $em);
        $accrual->accrueCapture($store, 2500, new \DateTimeImmutable('2026-08-30 18:00:00', new \DateTimeZone('America/Los_Angeles')));

        self::assertSame(2500, $ledger->getGrossCents());
    }

    public function testSkipsFlatPlanStores(): void
    {
        $store = (new Store())->setPlanKey('flat');
        $repo = $this->createMock(PlatformDailySalesLedgerRepository::class);
        $repo->expects(self::never())->method('findForStoreAndDate');

        $em = $this->createMock(EntityManagerInterface::class);
        $accrual = new PlatformDailySalesAccrual(new PlanCatalog(), $repo, $em);
        $accrual->accrueCapture($store, 2500);

        self::assertTrue(true);
    }
}
