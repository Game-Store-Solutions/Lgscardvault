<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Repository\PlatformDailySalesLedgerRepository;
use App\Service\Onboarding\PlanCatalog;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Adds shopper capture totals to the current business day's ledger. Usage-plan
 * stores are charged 10% of the daily total after midnight.
 */
final readonly class PlatformDailySalesAccrual
{
    public const BUSINESS_TIMEZONE = 'America/Los_Angeles';

    public function __construct(
        private PlanCatalog $planCatalog,
        private PlatformDailySalesLedgerRepository $ledgers,
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function accrueCapture(Store $store, int $captureCents, ?\DateTimeImmutable $at = null): void
    {
        if ($captureCents < 1) {
            return;
        }

        if (!$this->planCatalog->isUsagePlan($store->getPlanKey())) {
            return;
        }

        if ($store->hasMetPlatformCap()) {
            return;
        }

        $at ??= new \DateTimeImmutable();
        $businessDate = $this->businessDate($at);
        $ledger = $this->ledgers->findForStoreAndDate($store, $businessDate);
        if (null === $ledger) {
            $ledger = new \App\Entity\PlatformDailySalesLedger($store, $businessDate);
            $this->entityManager->persist($ledger);
        }

        $ledger->addGrossCents($captureCents);
    }

    public function businessDate(\DateTimeImmutable $at): \DateTimeImmutable
    {
        return $at->setTimezone(new \DateTimeZone(self::BUSINESS_TIMEZONE))->setTime(0, 0);
    }
}
