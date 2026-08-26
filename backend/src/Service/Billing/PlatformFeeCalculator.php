<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Service\Onboarding\PlanCatalog;

/**
 * Computes how much platform fee to collect on the next shopper capture.
 */
final readonly class PlatformFeeCalculator
{
    public function __construct(private PlanCatalog $planCatalog)
    {
    }

    public function feeDueForCapture(Store $store, int $captureAmountCents): int
    {
        if ($captureAmountCents < 1) {
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

        $fee = (int) round($captureAmountCents * $bps / 10000);

        return min(max(0, $fee), $remaining);
    }
}
