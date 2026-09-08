<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Repository\PlatformDailySalesLedgerRepository;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\PaypalSubscriptionBilling;
use App\Service\Payments\SubscriptionBillingInterface;

/**
 * Owner-facing snapshot of platform billing: plan, monthly obligation progress,
 * and today's usage take.
 *
 * @phpstan-type Status array{
 *   planKey: string|null,
 *   planName: string|null,
 *   billingModel: string|null,
 *   priceCents: int,
 *   capCents: int,
 *   monthObligationCents: int,
 *   feePercentBps: int,
 *   requiresVault: bool,
 *   platformFeesPaidCents: int,
 *   remainingCapCents: int,
 *   progressPercent: float,
 *   capReached: bool,
 *   willAutoChargeRemainder: bool,
 *   todayGrossCents: int,
 *   todayFeeCents: int,
 *   todayFeePercent: float,
 *   canBuyout: bool,
 *   buyoutCents: int,
 *   subscriptionStatus: string,
 *   paymentMethodType: string|null,
 *   paymentLast4: string|null,
 *   paymentConfigured: bool,
 *   currentPeriodEnd: string|null,
 *   lastChargedAt: string|null,
 *   failedAttempts: int,
 *   nextAttemptAt: string|null,
 *   billingProvider: string
 * }
 */
final readonly class PlatformSubscriptionStatus
{
    public function __construct(
        private PlanCatalog $planCatalog,
        private PlatformFeeCalculator $feeCalculator,
        private PlatformDailySalesAccrual $accrual,
        private PlatformDailySalesLedgerRepository $ledgers,
        private SubscriptionBillingInterface $billing,
        private PaypalSubscriptionBilling $paypalBilling,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Store $store, ?\DateTimeImmutable $now = null): array
    {
        $plan = $store->getPlanKey() ? $this->planCatalog->find($store->getPlanKey()) : null;
        $priceCents = (int) ($plan['priceCents'] ?? 0);
        $capCents = (int) ($plan['capCents'] ?? 0);
        $feePercentBps = (int) ($plan['feePercentBps'] ?? 0);
        $requiresVault = (bool) ($plan['requiresVault'] ?? false);
        $paid = $store->getPlatformFeesPaidCents();
        $remaining = $capCents > 0 ? max(0, $capCents - $paid) : 0;
        $isUsage = $this->planCatalog->isUsagePlan($store->getPlanKey());
        $isFlat = $this->planCatalog->isFlatPlan($store->getPlanKey());
        $capReached = $store->hasMetPlatformCap() || ($isUsage && $remaining < 1 && $capCents > 0)
            || ($isFlat && $paid >= $capCents && $capCents > 0);

        $now ??= new \DateTimeImmutable();
        $todayGross = 0;
        $todayFee = 0;
        if ($isUsage && !$capReached) {
            $ledger = $this->ledgers->findForStoreAndDate($store, $this->accrual->businessDate($now));
            $todayGross = $ledger?->getGrossCents() ?? 0;
            $todayFee = $this->feeCalculator->feeDueForDailyGross($store, $todayGross);
        }

        $canBuyout = $isUsage && $remaining > 0 && !$store->hasMetPlatformCap();
        $willAutoCharge = ($isUsage && $remaining > 0) || $isFlat;

        return [
            'planKey' => $store->getPlanKey(),
            'planName' => $plan['name'] ?? null,
            'billingModel' => $plan['billingModel'] ?? null,
            'priceCents' => $priceCents,
            'capCents' => $capCents,
            'monthObligationCents' => $capCents > 0 ? $capCents : PlanCatalog::PLATFORM_CAP_CENTS,
            'feePercentBps' => $feePercentBps,
            'requiresVault' => $requiresVault,
            'platformFeesPaidCents' => $paid,
            'remainingCapCents' => $remaining,
            'progressPercent' => $capCents > 0 ? round(min(100, ($paid / $capCents) * 100), 1) : 0.0,
            'capReached' => $capReached,
            'willAutoChargeRemainder' => $willAutoCharge && !$capReached,
            'todayGrossCents' => $todayGross,
            'todayFeeCents' => $todayFee,
            'todayFeePercent' => $feePercentBps > 0 ? round($feePercentBps / 100, 2) : 0.0,
            'canBuyout' => $canBuyout,
            'buyoutCents' => $canBuyout ? $remaining : 0,
            'subscriptionStatus' => $store->getSubscriptionStatus(),
            'paymentMethodType' => $store->getPaymentMethodType(),
            'paymentLast4' => $store->getPaymentLast4(),
            'paymentConfigured' => !$this->planCatalog->requiresPaymentMethod($store->getPlanKey())
                || null !== $store->getPaymentCardId(),
            'currentPeriodEnd' => $store->getCurrentPeriodEnd()?->format(\DATE_ATOM),
            'lastChargedAt' => $store->getLastChargedAt()?->format(\DATE_ATOM),
            'failedAttempts' => $store->getBillingAttempts(),
            'nextAttemptAt' => $store->getNextAttemptAt()?->format(\DATE_ATOM),
            'billingProvider' => $store->getBillingProvider(),
        ] + $this->billing->clientConfig() + ['paypal' => $this->paypalBilling->clientConfig()];
    }
}
