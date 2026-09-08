<?php

namespace App\Tests\Service;

use App\Entity\PlatformDailySalesLedger;
use App\Entity\Store;
use App\Service\Billing\PlatformDailyFeeSettler;
use App\Service\Billing\PlatformDailySalesAccrual;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakePaypalSubscriptionBilling;
use App\Tests\Support\FakeSubscriptionBilling;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Nightly 10% settlement for usage-plan stores.
 */
final class PlatformDailyFeeSettlerTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private PlatformDailyFeeSettler $settler;
    private FakeSubscriptionBilling $billing;
    private FakePaypalSubscriptionBilling $paypalBilling;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->settler = $c->get(PlatformDailyFeeSettler::class);
        $this->billing = $c->get(SubscriptionBillingInterface::class);
        $this->paypalBilling = $c->get(FakePaypalSubscriptionBilling::class);
        $this->billing->charges = [];
        $this->billing->declineWith = null;
        $this->paypalBilling->charges = [];
        $this->paypalBilling->declineWith = null;
    }

    public function testChargesTenPercentOfYesterdaysGross(): void
    {
        $store = $this->usageStore();
        $yesterday = $this->businessDay('-1 day');
        $ledger = new PlatformDailySalesLedger($store, $yesterday);
        $ledger->addGrossCents(20_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $results = $this->settler->run(now: $this->businessDay('now')->setTime(12, 0));

        self::assertCount(1, $results);
        self::assertSame('charged', $results[0]['outcome']);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(2_000, $this->billing->charges[0]['amount']);
        self::assertSame(2_000, $store->getPlatformFeesPaidCents());
        self::assertTrue($ledger->isSettled());
        self::assertSame(2_000, $ledger->getFeeSettledCents());
    }

    public function testSkipsFlatPlanLedgersWithoutCharging(): void
    {
        $store = $this->fixtures->store('flat-fee-'.bin2hex(random_bytes(2)));
        $store->setPlanKey('flat')->markPlatformCapReached();
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(50_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $results = $this->settler->run(now: $this->businessDay('now')->setTime(12, 0));

        self::assertSame('skipped', $results[0]['outcome']);
        self::assertSame([], $this->billing->charges);
        self::assertTrue($ledger->isSettled());
        self::assertSame(0, $ledger->getFeeSettledCents());
    }

    public function testNoCardMarksSettlementFailed(): void
    {
        $store = $this->usageStore(withCard: false);
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(10_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $results = $this->settler->run(now: $this->businessDay('now')->setTime(12, 0));

        self::assertSame('no_card', $results[0]['outcome']);
        self::assertSame([], $this->billing->charges);
        self::assertFalse($ledger->isSettled());
    }

    public function testDeclineDoesNotAccrueFees(): void
    {
        $store = $this->usageStore();
        $this->billing->declineWith = 'Insufficient funds.';
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(10_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $results = $this->settler->run(now: $this->businessDay('now')->setTime(12, 0));

        self::assertSame('declined', $results[0]['outcome']);
        self::assertSame(0, $store->getPlatformFeesPaidCents());
        self::assertFalse($ledger->isSettled());
    }

    public function testDryRunDoesNotChargeOrSettle(): void
    {
        $store = $this->usageStore();
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(10_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $results = $this->settler->run(dryRun: true, now: $this->businessDay('now')->setTime(12, 0));

        self::assertSame('would_charge', $results[0]['outcome']);
        self::assertSame([], $this->billing->charges);
        self::assertFalse($ledger->isSettled());
    }

    public function testSecondRunDoesNotDoubleCharge(): void
    {
        $store = $this->usageStore();
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(10_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $now = $this->businessDay('now')->setTime(12, 0);
        $this->settler->run(now: $now);
        $this->settler->run(now: $now);

        self::assertCount(1, $this->billing->charges);
        self::assertSame(1_000, $store->getPlatformFeesPaidCents());
    }

    public function testFeeIsCappedAtRemainingPlatformCap(): void
    {
        $store = $this->usageStore();
        $store->addPlatformFeesPaid(44_500);
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(100_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $this->settler->run(now: $this->businessDay('now')->setTime(12, 0));

        self::assertSame(500, $this->billing->charges[0]['amount']);
        self::assertTrue($store->hasMetPlatformCap());
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $store->getPlatformFeesPaidCents());
    }

    public function testPaypalBillingProviderUsesPaypalVault(): void
    {
        $store = $this->usageStore();
        $store->setBillingProvider(Store::BILLING_PAYPAL)
            ->setPaymentCustomerId('PAYER1')
            ->setPaymentCardId('VAULT1');
        $ledger = new PlatformDailySalesLedger($store, $this->businessDay('-1 day'));
        $ledger->addGrossCents(10_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $results = $this->settler->run(now: $this->businessDay('now')->setTime(12, 0));

        self::assertSame('charged', $results[0]['outcome']);
        self::assertSame([], $this->billing->charges);
        self::assertCount(1, $this->paypalBilling->charges);
        self::assertSame(1_000, $this->paypalBilling->charges[0]['amount']);
    }

    private function usageStore(bool $withCard = true): Store
    {
        $store = $this->fixtures->store('usage-fee-'.bin2hex(random_bytes(3)));
        $store->setPlanKey('usage')->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE);
        if ($withCard) {
            $store->setPaymentCustomerId('CUST1')
                ->setPaymentCardId('ccof:CARD1')
                ->setBillingProvider(Store::BILLING_SQUARE);
        }
        $this->em->flush();

        return $store;
    }

    private function businessDay(string $relative): \DateTimeImmutable
    {
        return (new \DateTimeImmutable($relative, new \DateTimeZone(PlatformDailySalesAccrual::BUSINESS_TIMEZONE)))
            ->setTime(0, 0);
    }
}
