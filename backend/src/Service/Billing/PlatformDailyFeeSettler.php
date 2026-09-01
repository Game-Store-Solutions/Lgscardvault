<?php

namespace App\Service\Billing;

use App\Entity\PlatformDailySalesLedger;
use App\Entity\Store;
use App\Repository\PlatformDailySalesLedgerRepository;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\PaypalSubscriptionBilling;
use App\Service\Payments\SubscriptionBillingInterface;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * At the end of each business day, charge usage-plan stores 10% of that day's
 * shopper capture total against the vaulted card on file.
 */
final readonly class PlatformDailyFeeSettler
{
    public function __construct(
        private PlanCatalog $planCatalog,
        private PlatformFeeCalculator $feeCalculator,
        private PlatformFeeRecorder $feeRecorder,
        private PlatformDailySalesLedgerRepository $ledgers,
        private PlatformDailySalesAccrual $accrual,
        private SubscriptionBillingInterface $billing,
        private PaypalSubscriptionBilling $paypalBilling,
        private EntityManagerInterface $entityManager,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return list<array{slug: string, date: string, outcome: string, detail: string}>
     */
    public function run(bool $dryRun = false, ?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $today = $this->accrual->businessDate($now);
        $results = [];

        foreach ($this->ledgers->findUnsettledBefore($today) as $ledger) {
            $results[] = $this->settleLedger($ledger, $now, $dryRun);
        }

        if (!$dryRun) {
            $this->entityManager->flush();
        }

        return $results;
    }

    /**
     * @return array{slug: string, date: string, outcome: string, detail: string}
     */
    private function settleLedger(PlatformDailySalesLedger $ledger, \DateTimeImmutable $now, bool $dryRun): array
    {
        $store = $ledger->getStore();
        $slug = (string) $store->getSlug();
        $date = $ledger->getBusinessDate()->format('Y-m-d');
        $gross = $ledger->getGrossCents();

        if (!$this->planCatalog->isUsagePlan($store->getPlanKey()) || $store->hasMetPlatformCap()) {
            if (!$dryRun) {
                $ledger->markSettled(0, null, $now);
            }

            return ['slug' => $slug, 'date' => $date, 'outcome' => 'skipped', 'detail' => 'Plan no longer accrues fees.'];
        }

        $feeDue = $this->feeCalculator->feeDueForDailyGross($store, $gross);
        if ($gross < 1 || $feeDue < 1) {
            if (!$dryRun) {
                $ledger->markSettled(0, null, $now);
            }

            return ['slug' => $slug, 'date' => $date, 'outcome' => 'no_fee', 'detail' => 'No platform fee due for the day.'];
        }

        $customerId = $store->getPaymentCustomerId();
        $cardId = $store->getPaymentCardId();
        if (null === $customerId || '' === $customerId || null === $cardId || '' === $cardId) {
            if (!$dryRun) {
                $ledger->markSettlementFailed('No card on file for daily platform fee.');
            }

            return ['slug' => $slug, 'date' => $date, 'outcome' => 'no_card', 'detail' => 'No card on file.'];
        }

        $amountLabel = number_format($feeDue / 100, 2);
        if ($dryRun) {
            return [
                'slug' => $slug,
                'date' => $date,
                'outcome' => 'would_charge',
                'detail' => sprintf('$%s on $%s daily sales', $amountLabel, number_format($gross / 100, 2)),
            ];
        }

        try {
            $reference = $this->chargeVaultedCard($store, $customerId, $cardId, $feeDue, $ledger);
        } catch (\RuntimeException $e) {
            $ledger->markSettlementFailed($e->getMessage());
            $this->logger->warning('Daily platform fee settlement failed', [
                'store' => $slug,
                'date' => $date,
                'grossCents' => $gross,
                'feeCents' => $feeDue,
                'reason' => $e->getMessage(),
            ]);

            return ['slug' => $slug, 'date' => $date, 'outcome' => 'declined', 'detail' => $e->getMessage()];
        }

        $this->feeRecorder->recordCollectedFee($store, $feeDue);
        $ledger->markSettled($feeDue, $reference, $now);

        return [
            'slug' => $slug,
            'date' => $date,
            'outcome' => 'charged',
            'detail' => sprintf('$%s — txn %s', $amountLabel, $reference),
        ];
    }

    private function chargeVaultedCard(
        Store $store,
        string $customerId,
        string $cardId,
        int $feeDue,
        PlatformDailySalesLedger $ledger,
    ): string {
        $idempotencyKey = sprintf(
            'platform-daily-%d-%s-%d',
            (int) $store->getId(),
            $ledger->getBusinessDate()->format('Ymd'),
            $ledger->getSettlementAttempts(),
        );

        if (Store::BILLING_PAYPAL === $store->getBillingProvider()) {
            $result = $this->paypalBilling->chargeVaultedCard(
                $customerId,
                $cardId,
                $feeDue,
                $idempotencyKey,
            );
        } else {
            $result = $this->billing->chargeVaultedCard(
                $customerId,
                $cardId,
                $feeDue,
                $idempotencyKey,
            );
        }

        return (string) ($result['reference'] ?? $idempotencyKey);
    }
}
