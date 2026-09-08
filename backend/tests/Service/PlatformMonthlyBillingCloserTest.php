<?php

namespace App\Tests\Service;

use App\Entity\Store;
use App\Service\Billing\BillingPeriod;
use App\Service\Billing\PlatformMonthlyBillingCloser;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeSubscriptionBilling;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class PlatformMonthlyBillingCloserTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private PlatformMonthlyBillingCloser $closer;
    private FakeSubscriptionBilling $billing;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->closer = $c->get(PlatformMonthlyBillingCloser::class);
        $this->billing = $c->get(SubscriptionBillingInterface::class);
        $this->billing->charges = [];
        $this->billing->declineWith = null;
        $this->billing->live = true;
    }

    public function testUsageRemainderChargedAndNextMonthOpened(): void
    {
        $periodEnd = BillingPeriod::endOfMonthContaining(new \DateTimeImmutable('-5 days'));
        $store = $this->usageStore(10_000, $periodEnd);
        $now = $periodEnd->modify('+1 hour');

        $results = $this->closer->run(now: $now);

        self::assertSame('charged', $results[0]['outcome']);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(35_000, $this->billing->charges[0]['amount']);
        self::assertSame(0, $store->getPlatformFeesPaidCents());
        self::assertGreaterThan($periodEnd, $store->getCurrentPeriodEnd());
        self::assertSame(Store::SUBSCRIPTION_ACTIVE, $store->getSubscriptionStatus());
        self::assertTrue($store->isActive());
    }

    public function testUsageMonthAlreadyPaidRollsWithoutCharge(): void
    {
        $periodEnd = BillingPeriod::endOfMonthContaining(new \DateTimeImmutable('-2 days'));
        $store = $this->usageStore(PlanCatalog::PLATFORM_CAP_CENTS, $periodEnd);
        $now = $periodEnd->modify('+1 hour');

        $results = $this->closer->run(now: $now);

        self::assertSame('rolled', $results[0]['outcome']);
        self::assertSame([], $this->billing->charges);
        self::assertSame(0, $store->getPlatformFeesPaidCents());
        self::assertGreaterThan($periodEnd, $store->getCurrentPeriodEnd());
    }

    public function testFlatRenewsFullMonthFee(): void
    {
        $periodEnd = BillingPeriod::endOfMonthContaining(new \DateTimeImmutable('-2 days'));
        $store = $this->flatStore($periodEnd);
        $now = $periodEnd->modify('+1 hour');

        $results = $this->closer->run(now: $now);

        self::assertSame('charged', $results[0]['outcome']);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $this->billing->charges[0]['amount']);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $store->getPlatformFeesPaidCents());
        self::assertGreaterThan($periodEnd, $store->getCurrentPeriodEnd());
    }

    public function testDeclineEventuallySuspendsStorefront(): void
    {
        $periodEnd = BillingPeriod::endOfMonthContaining(new \DateTimeImmutable('-2 days'));
        $store = $this->usageStore(10_000, $periodEnd);
        $this->billing->declineWith = 'Card declined.';
        $now = $periodEnd->modify('+1 hour');

        for ($i = 1; $i <= 4; ++$i) {
            $this->closer->run(now: $now->modify('+'.(20 * $i).' days'));
        }

        self::assertSame(Store::SUBSCRIPTION_SUSPENDED, $store->getSubscriptionStatus());
        self::assertFalse($store->isActive());
    }

    public function testWarningSentOnceAtSevenDays(): void
    {
        $now = new \DateTimeImmutable('now', BillingPeriod::timezone());
        $periodEnd = $now->modify('+7 days')->setTime(23, 59, 59);
        $store = $this->usageStore(10_000, $periodEnd);

        $first = $this->closer->run(now: $now);
        $second = $this->closer->run(now: $now);

        self::assertSame('warned', $first[0]['outcome']);
        self::assertSame([], $second);
        self::assertNotNull($store->getBillingWarning7SentFor());
    }

    public function testDryRunDoesNotCharge(): void
    {
        $periodEnd = BillingPeriod::endOfMonthContaining(new \DateTimeImmutable('-1 day'));
        $this->usageStore(5_000, $periodEnd);

        $results = $this->closer->run(dryRun: true, now: $periodEnd->modify('+1 hour'));

        self::assertSame('would_charge', $results[0]['outcome']);
        self::assertSame([], $this->billing->charges);
    }

    private function usageStore(int $paidCents, \DateTimeImmutable $periodEnd): Store
    {
        $store = $this->fixtures->store('month-usage-'.bin2hex(random_bytes(3)));
        $store->setPlanKey('usage')
            ->setIsActive(true)
            ->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE)
            ->setPaymentCustomerId('CUST1')
            ->setPaymentCardId('ccof:CARD1')
            ->addPlatformFeesPaid($paidCents)
            ->setCurrentPeriodEnd($periodEnd);
        $this->em->flush();

        return $store;
    }

    private function flatStore(\DateTimeImmutable $periodEnd): Store
    {
        $store = $this->fixtures->store('month-flat-'.bin2hex(random_bytes(3)));
        $store->setPlanKey('flat')
            ->setIsActive(true)
            ->beginCurrentBillingMonth($periodEnd->modify('-10 days'), monthPrepaid: true)
            ->setCurrentPeriodEnd($periodEnd)
            ->setPaymentCustomerId('CUST1')
            ->setPaymentCardId('ccof:CARD1');
        $this->em->flush();

        return $store;
    }
}
