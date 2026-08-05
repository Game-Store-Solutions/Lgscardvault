<?php

namespace App\Tests\Service;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Service\Payments\SubscriptionRenewer;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeSubscriptionBilling;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Recurring billing for the owner's platform subscription.
 *
 * The property that matters most is that nobody is charged twice: not by a
 * cron that runs more than once, not by a retry, and not by a run that happens
 * before the paid period has actually elapsed.
 */
final class SubscriptionRenewerTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private SubscriptionRenewer $renewer;
    private FakeSubscriptionBilling $billing;

    protected function setUp(): void
    {
        self::bootKernel();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->renewer = $container->get(SubscriptionRenewer::class);
        // Aliased to the fake in config/services.yaml (when@test).
        $this->billing = $container->get(SubscriptionBillingInterface::class);
    }

    /** A store already one day past the end of its paid period. */
    private function subscribedStore(string $plan = 'pro', string $periodEnd = '-1 day'): Store
    {
        $store = $this->fixtures->store();
        $store->setPlanKey($plan)
            ->setIsActive(true)
            ->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE)
            ->setPaymentCustomerId('CUST1')
            ->setPaymentCardId('ccof:CARD1')
            ->setCurrentPeriodEnd(new \DateTimeImmutable($periodEnd));
        $this->em->flush();

        return $store;
    }

    public function testChargesOnlyOnceThePaidPeriodHasElapsed(): void
    {
        $store = $this->subscribedStore(periodEnd: '+10 days');

        $this->renewer->run();

        self::assertSame([], $this->billing->charges, 'A store inside its paid period must not be charged.');
        self::assertSame(Store::SUBSCRIPTION_ACTIVE, $store->getSubscriptionStatus());
    }

    public function testDueStoreIsChargedThePlanPriceAndRolledForward(): void
    {
        $store = $this->subscribedStore();
        $previousEnd = $store->getCurrentPeriodEnd();

        $this->renewer->run();

        self::assertCount(1, $this->billing->charges);
        self::assertSame(4900, $this->billing->charges[0]['amount']);
        self::assertSame(Store::SUBSCRIPTION_ACTIVE, $store->getSubscriptionStatus());
        self::assertNotNull($store->getLastChargedAt());
        self::assertGreaterThan($previousEnd, $store->getCurrentPeriodEnd());
        self::assertGreaterThan(new \DateTimeImmutable(), $store->getCurrentPeriodEnd(), 'The new period must be in the future.');

        $history = $this->em->getRepository(SubscriptionCharge::class)->findBy(['store' => $store]);
        self::assertCount(1, $history);
        self::assertTrue($history[0]->isPaid());
        self::assertSame(4900, $history[0]->getAmountCents());
    }

    /**
     * The regression that motivated billing periods: before they existed every
     * run charged every subscriber, so a nightly cron billed monthly plans daily.
     */
    public function testSecondRunDoesNotChargeAgain(): void
    {
        $this->subscribedStore();

        $this->renewer->run();
        $this->renewer->run();

        self::assertCount(1, $this->billing->charges, 'Re-running must not re-charge a store that was just renewed.');
    }

    public function testOverlappingRunsShareOneIdempotencyKey(): void
    {
        $store = $this->subscribedStore();
        $expected = sprintf('sub-%d-%s-0', $store->getId(), $store->getCurrentPeriodEnd()?->format('Ymd'));

        $this->renewer->run();

        self::assertSame($expected, $this->billing->charges[0]['idempotencyKey']);
    }

    public function testDeclineMarksPastDueAndBacksOffBeforeRetrying(): void
    {
        $store = $this->subscribedStore();
        $this->billing->declineWith = 'Card declined.';

        $this->renewer->run();

        self::assertSame(Store::SUBSCRIPTION_PAST_DUE, $store->getSubscriptionStatus());
        self::assertSame(1, $store->getBillingAttempts());
        self::assertNotNull($store->getNextAttemptAt());
        self::assertGreaterThan(new \DateTimeImmutable(), $store->getNextAttemptAt());

        // Still declining, but the backoff has not elapsed, so we leave it alone.
        $this->renewer->run();
        self::assertSame(1, $store->getBillingAttempts(), 'A store in backoff must not be retried early.');
    }

    public function testDunningSuspendsAfterTheRetriesAreExhausted(): void
    {
        $store = $this->subscribedStore();
        $this->billing->declineWith = 'Card declined.';

        // Each run jumps far enough ahead that the previous backoff has lapsed.
        for ($attempt = 1; $attempt <= 4; ++$attempt) {
            $this->renewer->run(now: new \DateTimeImmutable('+'.(20 * $attempt).' days'));
        }

        self::assertSame(4, $store->getBillingAttempts());
        self::assertSame(Store::SUBSCRIPTION_SUSPENDED, $store->getSubscriptionStatus());
        self::assertNull($store->getNextAttemptAt(), 'A suspended store has no scheduled retry.');
    }

    public function testSuspendedStoreIsNotPickedUpAgain(): void
    {
        $store = $this->subscribedStore();
        $store->setSubscriptionStatus(Store::SUBSCRIPTION_SUSPENDED);
        $this->em->flush();

        $this->renewer->run();

        self::assertSame([], $this->billing->charges);
    }

    public function testRetryAfterDeclineUsesAFreshIdempotencyKey(): void
    {
        $store = $this->subscribedStore();
        $this->billing->declineWith = 'Card declined.';
        $this->renewer->run();

        // Owner fixes the card; the next attempt must be a genuine new charge
        // rather than a replay of the recorded decline.
        $this->billing->declineWith = null;
        $this->renewer->run(now: new \DateTimeImmutable('+2 days'));

        self::assertCount(1, $this->billing->charges);
        self::assertStringEndsWith('-1', (string) $this->billing->charges[0]['idempotencyKey']);
        self::assertSame(Store::SUBSCRIPTION_ACTIVE, $store->getSubscriptionStatus());
        self::assertSame(0, $store->getBillingAttempts());
    }

    public function testFreePlanIsRolledForwardWithoutCharging(): void
    {
        $store = $this->subscribedStore(plan: 'starter');

        $this->renewer->run();

        self::assertSame([], $this->billing->charges);
        self::assertGreaterThan(new \DateTimeImmutable(), $store->getCurrentPeriodEnd());
    }

    public function testStoreWithoutACardOnFileIsNotCharged(): void
    {
        $store = $this->subscribedStore();
        $store->setPaymentCardId(null);
        $this->em->flush();

        $this->renewer->run();

        self::assertSame([], $this->billing->charges);
        self::assertSame(Store::SUBSCRIPTION_PAST_DUE, $store->getSubscriptionStatus());
    }

    public function testDryRunReportsWithoutCharging(): void
    {
        $this->subscribedStore();

        $results = $this->renewer->run(dryRun: true);

        self::assertSame([], $this->billing->charges);
        self::assertCount(1, $results);
        self::assertSame('would_charge', $results[0]['outcome']);
    }
}
