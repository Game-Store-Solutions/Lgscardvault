<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Repository\StoreRepository;
use App\Service\Mail\TransactionalMailer;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\PaypalSubscriptionBilling;
use App\Service\Payments\SubscriptionBillingInterface;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Warns owners before period end, then at close: charges usage remainder or
 * flat $450 renewal. Decline → dunning → suspend + deactivate storefront.
 */
final readonly class PlatformMonthlyBillingCloser
{
    /** Same backoff cadence as {@see \App\Service\Payments\SubscriptionRenewer}. */
    private const RETRY_BACKOFF = ['+1 day', '+3 days', '+5 days'];

    private const WARNING_DAYS = [7, 3, 1];

    public function __construct(
        private StoreRepository $stores,
        private PlanCatalog $planCatalog,
        private PlatformPlanBuyout $buyout,
        private SubscriptionBillingInterface $billing,
        private PaypalSubscriptionBilling $paypalBilling,
        private TransactionalMailer $mailer,
        private EntityManagerInterface $entityManager,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return list<array{slug: string, outcome: string, detail: string}>
     */
    public function run(bool $dryRun = false, ?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $results = [];

        foreach ($this->stores->findPlatformMonthlyBillingStores() as $store) {
            $periodEnd = $store->getCurrentPeriodEnd();
            if (!$periodEnd instanceof \DateTimeImmutable) {
                continue;
            }

            if ($periodEnd > $now) {
                $warned = $this->maybeWarn($store, $periodEnd, $now, $dryRun);
                if (null !== $warned) {
                    $results[] = $warned;
                }
                continue;
            }

            if (!$store->isRenewalDue($now)) {
                continue;
            }

            $results[] = $this->closePeriod($store, $now, $dryRun);
        }

        if (!$dryRun) {
            $this->entityManager->flush();
        }

        return $results;
    }

    /**
     * @return array{slug: string, outcome: string, detail: string}|null
     */
    private function maybeWarn(Store $store, \DateTimeImmutable $periodEnd, \DateTimeImmutable $now, bool $dryRun): ?array
    {
        $days = BillingPeriod::wholeDaysUntil($periodEnd, $now);
        if (!in_array($days, self::WARNING_DAYS, true)) {
            return null;
        }

        $amountDue = $this->amountDueBeforeClose($store);
        if ($amountDue < 1 && $this->planCatalog->isUsagePlan($store->getPlanKey())) {
            return null;
        }
        // Flat always warns about the upcoming $450 renewal.
        if ($this->planCatalog->isFlatPlan($store->getPlanKey())) {
            $amountDue = PlanCatalog::PLATFORM_CAP_CENTS;
        }

        $periodDay = $periodEnd->setTimezone(BillingPeriod::timezone())->setTime(0, 0);
        if ($this->warningAlreadySent($store, $days, $periodDay)) {
            return null;
        }

        $slug = (string) $store->getSlug();
        if ($dryRun) {
            return ['slug' => $slug, 'outcome' => 'would_warn', 'detail' => sprintf('%d day(s), $%s', $days, number_format($amountDue / 100, 2))];
        }

        $this->mailer->sendBillingPeriodWarning($store, $days, $amountDue, $periodEnd);
        $this->markWarningSent($store, $days, $periodDay);

        return ['slug' => $slug, 'outcome' => 'warned', 'detail' => sprintf('%d day(s) left', $days)];
    }

    /**
     * @return array{slug: string, outcome: string, detail: string}
     */
    private function closePeriod(Store $store, \DateTimeImmutable $now, bool $dryRun): array
    {
        $slug = (string) $store->getSlug();

        if ($this->planCatalog->isFlatPlan($store->getPlanKey())) {
            return $this->closeFlat($store, $now, $dryRun);
        }

        if ($this->planCatalog->isUsagePlan($store->getPlanKey())) {
            return $this->closeUsage($store, $now, $dryRun);
        }

        return ['slug' => $slug, 'outcome' => 'skipped', 'detail' => 'Not a platform monthly plan.'];
    }

    /**
     * @return array{slug: string, outcome: string, detail: string}
     */
    private function closeFlat(Store $store, \DateTimeImmutable $now, bool $dryRun): array
    {
        $slug = (string) $store->getSlug();
        $amount = PlanCatalog::PLATFORM_CAP_CENTS;

        if ($dryRun) {
            return ['slug' => $slug, 'outcome' => 'would_charge', 'detail' => sprintf('Flat renew $%s', number_format($amount / 100, 2))];
        }

        try {
            $reference = $this->chargeVault($store, $amount, sprintf(
                'platform-flat-%d-%s-%d',
                (int) $store->getId(),
                $store->getCurrentPeriodEnd()?->format('Ym') ?? 'na',
                $store->getBillingAttempts(),
            ));
        } catch (\RuntimeException $e) {
            return $this->failClose($store, $now, $amount, $e->getMessage());
        }

        $this->entityManager->persist(SubscriptionCharge::paid($store, $amount, $reference, $store->getBillingAttempts()));
        $store->openNextBillingMonth($now, monthPrepaid: true);
        $this->mailer->sendBillingRenewalCharged($store, $amount);

        return ['slug' => $slug, 'outcome' => 'charged', 'detail' => sprintf('Flat renew $%s', number_format($amount / 100, 2))];
    }

    /**
     * @return array{slug: string, outcome: string, detail: string}
     */
    private function closeUsage(Store $store, \DateTimeImmutable $now, bool $dryRun): array
    {
        $slug = (string) $store->getSlug();
        $remaining = $this->buyout->remainingCents($store);

        if ($remaining < 1) {
            if ($dryRun) {
                return ['slug' => $slug, 'outcome' => 'would_roll', 'detail' => 'Month already paid — open next.'];
            }
            $store->openNextBillingMonth($now, monthPrepaid: false);

            return ['slug' => $slug, 'outcome' => 'rolled', 'detail' => 'Month paid in full.'];
        }

        if ($dryRun) {
            return ['slug' => $slug, 'outcome' => 'would_charge', 'detail' => sprintf('Remainder $%s', number_format($remaining / 100, 2))];
        }

        try {
            $reference = $this->chargeVault($store, $remaining, sprintf(
                'platform-remainder-%d-%s-%d',
                (int) $store->getId(),
                $store->getCurrentPeriodEnd()?->format('Ym') ?? 'na',
                $store->getBillingAttempts(),
            ));
        } catch (\RuntimeException $e) {
            return $this->failClose($store, $now, $remaining, $e->getMessage());
        }

        $this->entityManager->persist(SubscriptionCharge::paid($store, $remaining, $reference, $store->getBillingAttempts()));
        $store->openNextBillingMonth($now, monthPrepaid: false);
        $this->mailer->sendBillingRemainderCharged($store, $remaining);

        return ['slug' => $slug, 'outcome' => 'charged', 'detail' => sprintf('Remainder $%s', number_format($remaining / 100, 2))];
    }

    /**
     * @return array{slug: string, outcome: string, detail: string}
     */
    private function failClose(Store $store, \DateTimeImmutable $now, int $amountCents, string $reason): array
    {
        $slug = (string) $store->getSlug();
        $attempt = $store->getBillingAttempts() + 1;
        $backoff = self::RETRY_BACKOFF[$attempt - 1] ?? null;
        $retryAt = null === $backoff ? null : $now->modify($backoff);

        $this->entityManager->persist(SubscriptionCharge::failed($store, $amountCents, $reason, $attempt));
        $store->markSubscriptionAttemptFailed($now, $retryAt);
        $this->mailer->sendBillingChargeFailed($store, $amountCents, $reason);

        if (null === $retryAt) {
            $store->suspendForBillingFailure();
            $this->mailer->sendBillingSuspended($store);
            $this->logger->warning('Platform monthly billing suspended store', [
                'store' => $slug,
                'reason' => $reason,
            ]);

            return ['slug' => $slug, 'outcome' => 'suspended', 'detail' => $reason];
        }

        return ['slug' => $slug, 'outcome' => 'declined', 'detail' => $reason];
    }

    private function chargeVault(Store $store, int $amountCents, string $idempotencyKey): string
    {
        $customerId = $store->getPaymentCustomerId();
        $cardId = $store->getPaymentCardId();
        $usingPaypal = Store::BILLING_PAYPAL === $store->getBillingProvider();
        $live = $usingPaypal ? $this->paypalBilling->isLive() : $this->billing->isLive();
        if ($live && (null === $customerId || '' === $customerId || null === $cardId || '' === $cardId)) {
            throw new \RuntimeException('No card on file.');
        }

        if ($usingPaypal) {
            $result = $this->paypalBilling->chargeVaultedCard(
                (string) $customerId,
                (string) $cardId,
                $amountCents,
                $idempotencyKey,
            );
        } else {
            $result = $this->billing->chargeVaultedCard(
                (string) $customerId,
                (string) $cardId,
                $amountCents,
                $idempotencyKey,
            );
        }

        return (string) ($result['reference'] ?? $idempotencyKey);
    }

    private function amountDueBeforeClose(Store $store): int
    {
        if ($this->planCatalog->isFlatPlan($store->getPlanKey())) {
            return PlanCatalog::PLATFORM_CAP_CENTS;
        }

        return $this->buyout->remainingCents($store);
    }

    private function warningAlreadySent(Store $store, int $days, \DateTimeImmutable $periodDay): bool
    {
        $sent = match ($days) {
            7 => $store->getBillingWarning7SentFor(),
            3 => $store->getBillingWarning3SentFor(),
            1 => $store->getBillingWarning1SentFor(),
            default => null,
        };

        return $sent instanceof \DateTimeImmutable && $sent->format('Y-m-d') === $periodDay->format('Y-m-d');
    }

    private function markWarningSent(Store $store, int $days, \DateTimeImmutable $periodDay): void
    {
        match ($days) {
            7 => $store->setBillingWarning7SentFor($periodDay),
            3 => $store->setBillingWarning3SentFor($periodDay),
            1 => $store->setBillingWarning1SentFor($periodDay),
            default => null,
        };
    }
}
