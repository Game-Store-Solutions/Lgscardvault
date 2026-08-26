<?php

namespace App\Service\Payments;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Repository\StoreRepository;
use App\Service\Onboarding\PlanCatalog;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Renews platform subscriptions for stores whose paid period has lapsed.
 *
 * Shared by the console command and the scheduler so both behave identically.
 *
 * Two properties matter more than anything else here:
 *
 * 1. A store is only charged once its {@see Store::$currentPeriodEnd} has
 *    passed. Without that, every run would bill every active store.
 * 2. Each attempt carries a deterministic idempotency key, so two overlapping
 *    runs — or a crash between Square capturing the money and us recording it —
 *    cannot take payment twice. The key includes the attempt number so a later
 *    dunning retry is still a genuine new charge rather than a replay of the
 *    original decline.
 */
final readonly class SubscriptionRenewer
{
    /**
     * Backoff between declined attempts. Running out of entries suspends the
     * subscription rather than retrying forever against a dead card.
     */
    private const RETRY_BACKOFF = ['+1 day', '+3 days', '+5 days'];

    public function __construct(
        private StoreRepository $storeRepository,
        private PlanCatalog $planCatalog,
        private SubscriptionBillingInterface $billing,
        private PaypalSubscriptionBilling $paypalBilling,
        private EntityManagerInterface $entityManager,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return list<array{slug: string, outcome: string, detail: string}> one entry per store considered
     */
    public function run(bool $dryRun = false, ?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $results = [];

        foreach ($this->storeRepository->findDueForRenewal($now) as $store) {
            $results[] = $this->renew($store, $now, $dryRun);
        }

        if (!$dryRun) {
            $this->entityManager->flush();
        }

        return $results;
    }

    /**
     * @return array{slug: string, outcome: string, detail: string}
     */
    private function renew(Store $store, \DateTimeImmutable $now, bool $dryRun): array
    {
        $slug = (string) $store->getSlug();
        $priceCents = $this->monthlyRenewalCents($store);

        // A store moved onto the free tier still has a period end; carry it
        // forward instead of charging or endlessly re-selecting it.
        if ($priceCents <= 0) {
            if (!$dryRun) {
                $store->markSubscriptionCharged($now);
            }

            return ['slug' => $slug, 'outcome' => 'free', 'detail' => 'No charge — plan is free.'];
        }

        $customerId = $store->getPaymentCustomerId();
        $cardId = $store->getPaymentCardId();
        if (null === $customerId || '' === $customerId || null === $cardId || '' === $cardId) {
            if (!$dryRun) {
                $this->fail($store, $now, $priceCents, 'No card on file.');
            }

            return ['slug' => $slug, 'outcome' => 'no_card', 'detail' => 'No card on file.'];
        }

        $amount = number_format($priceCents / 100, 2);
        if ($dryRun) {
            return ['slug' => $slug, 'outcome' => 'would_charge', 'detail' => sprintf('$%s for %s', $amount, (string) $store->getPlanKey())];
        }

        $attempt = $store->getBillingAttempts();

        try {
            if (Store::BILLING_PAYPAL === $store->getBillingProvider()) {
                $result = $this->paypalBilling->chargeVaultedCard(
                    $customerId,
                    $cardId,
                    $priceCents,
                    $this->idempotencyKey($store),
                );
            } else {
                $result = $this->billing->chargeVaultedCard(
                    $customerId,
                    $cardId,
                    $priceCents,
                    $this->idempotencyKey($store),
                );
            }
        } catch (\RuntimeException $e) {
            $this->fail($store, $now, $priceCents, $e->getMessage());

            return ['slug' => $slug, 'outcome' => 'declined', 'detail' => $e->getMessage()];
        }

        $this->entityManager->persist(SubscriptionCharge::paid($store, $priceCents, $result['reference'], $attempt));

        $store->setPaymentReference($result['reference'])
            ->markSubscriptionCharged($now);

        return ['slug' => $slug, 'outcome' => 'charged', 'detail' => sprintf('$%s — txn %s', $amount, $result['reference'])];
    }

    private function fail(Store $store, \DateTimeImmutable $now, int $priceCents, string $reason): void
    {
        $attempt = $store->getBillingAttempts() + 1;
        $backoff = self::RETRY_BACKOFF[$attempt - 1] ?? null;
        $retryAt = null === $backoff ? null : $now->modify($backoff);

        $this->entityManager->persist(SubscriptionCharge::failed($store, $priceCents, $reason, $attempt));
        $store->markSubscriptionAttemptFailed($now, $retryAt);

        $this->logger->warning('Subscription renewal failed', [
            'store' => $store->getSlug(),
            'attempt' => $attempt,
            'reason' => $reason,
            'suspended' => null === $retryAt,
        ]);
    }

    /**
     * Stable within one attempt for one billing period, so retries of the same
     * attempt collapse into a single charge on Square's side.
     */
    private function idempotencyKey(Store $store): string
    {
        return sprintf(
            'sub-%d-%s-%d',
            (int) $store->getId(),
            $store->getCurrentPeriodEnd()?->format('Ymd') ?? 'na',
            $store->getBillingAttempts(),
        );
    }

    private function monthlyRenewalCents(Store $store): int
    {
        $planKey = $store->getPlanKey();
        if (null === $planKey || '' === $planKey) {
            return 0;
        }

        return $this->planCatalog->monthlyRenewalCents($planKey);
    }
}
