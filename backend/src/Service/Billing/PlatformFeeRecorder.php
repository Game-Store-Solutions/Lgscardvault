<?php

namespace App\Service\Billing;

use App\Entity\Order;
use App\Entity\Store;
use App\Service\Onboarding\PlanCatalog;

/**
 * Usage-plan stores accrue platform fees as a % of each shopper capture until
 * the $450 cap is met. Fees are tracked on the store; actual fund movement uses
 * the same processor split the store already connected for checkout.
 */
final readonly class PlatformFeeRecorder
{
    public function __construct(private PlanCatalog $planCatalog)
    {
    }

    public function recordFromOrder(Order $order): void
    {
        $store = $order->getStore();
        if (!$store instanceof Store) {
            return;
        }

        if (!$this->planCatalog->isUsagePlan($store->getPlanKey())) {
            return;
        }

        if ($store->hasMetPlatformCap()) {
            return;
        }

        $paidCents = $order->getPaidCents();
        if ($paidCents < 1) {
            return;
        }

        $bps = $this->planCatalog->usageFeeBps($store->getPlanKey());
        if ($bps < 1) {
            return;
        }

        $cap = $this->planCatalog->platformCapCents($store->getPlanKey());
        $remaining = max(0, $cap - $store->getPlatformFeesPaidCents());
        if ($remaining < 1) {
            $store->markPlatformCapReached();

            return;
        }

        $fee = (int) round($paidCents * $bps / 10000);
        $fee = min(max(0, $fee), $remaining);
        if ($fee < 1) {
            return;
        }

        $store->addPlatformFeesPaid($fee);
        if ($store->hasMetPlatformCap()) {
            $store->markPlatformCapReached();
        }
    }
}
