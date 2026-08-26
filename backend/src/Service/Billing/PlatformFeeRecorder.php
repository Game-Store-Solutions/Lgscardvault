<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Service\Onboarding\PlanCatalog;

/**
 * Usage-plan stores accrue platform fees as a % of each shopper capture until
 * the $450 cap is met. Call {@see recordCollectedFee} only after the processor
 * confirms the split was included on the payment.
 */
final readonly class PlatformFeeRecorder
{
    public function __construct(private PlanCatalog $planCatalog)
    {
    }

    public function recordCollectedFee(Store $store, int $feeCents): void
    {
        if ($feeCents < 1) {
            return;
        }

        if (!$this->planCatalog->isUsagePlan($store->getPlanKey())) {
            return;
        }

        if ($store->hasMetPlatformCap()) {
            return;
        }

        $cap = $this->planCatalog->platformCapCents($store->getPlanKey());
        $remaining = max(0, $cap - $store->getPlatformFeesPaidCents());
        if ($remaining < 1) {
            $store->markPlatformCapReached();

            return;
        }

        $fee = min($feeCents, $remaining);
        if ($fee < 1) {
            return;
        }

        $store->addPlatformFeesPaid($fee);
        if ($store->hasMetPlatformCap()) {
            $store->markPlatformCapReached();
        }
    }
}
