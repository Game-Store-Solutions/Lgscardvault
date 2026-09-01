<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Service\Onboarding\PlanCatalog;

/**
 * Computes usage-plan platform fees from daily shopper capture totals.
 * Per-transaction splits are not used — fees settle nightly at midnight.
 */
final readonly class PlatformFeeCalculator
{
    public function __construct(private PlanCatalog $planCatalog)
    {
    }

    /** Usage-plan fees are settled nightly; nothing is split at capture time. */
    public function feeDueForCapture(Store $store, int $captureAmountCents): int
    {
        return 0;
    }

    public function feeDueForDailyGross(Store $store, int $dailyGrossCents): int
    {
        if ($dailyGrossCents < 1) {
            return 0;
        }

        if (!$this->planCatalog->isUsagePlan($store->getPlanKey())) {
            return 0;
        }

        if ($store->hasMetPlatformCap()) {
            return 0;
        }

        $bps = $this->planCatalog->usageFeeBps($store->getPlanKey());
        if ($bps < 1) {
            return 0;
        }

        $cap = $this->planCatalog->platformCapCents($store->getPlanKey());
        $remaining = max(0, $cap - $store->getPlatformFeesPaidCents());
        if ($remaining < 1) {
            return 0;
        }

        $fee = (int) round($dailyGrossCents * $bps / 10000);

        return min(max(0, $fee), $remaining);
    }
}
