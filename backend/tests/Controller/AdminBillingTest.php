<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeSubscriptionBilling;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Platform-admin view of what store owners pay the marketplace.
 *
 * Two properties matter: only a super-admin can see or charge, and the summary
 * numbers must match the store + charge rows rather than inventing MRR from
 * free tiers or inactive status words.
 */
final class AdminBillingTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakeSubscriptionBilling $billing;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->billing = $c->get(SubscriptionBillingInterface::class);
        $this->billing->charges = [];
        $this->billing->declineWith = null;
    }

    private function paidStore(string $status = Store::SUBSCRIPTION_ACTIVE, string $plan = 'pro'): Store
    {
        $store = $this->fixtures->store();
        $store->setPlanKey($plan)
            ->setIsActive(true)
            ->setSubscriptionStatus($status)
            ->setPaymentCustomerId('CUST1')
            ->setPaymentCardId('ccof:CARD1')
            ->setPaymentLast4('1111')
            ->setPaymentMethodType('card')
            ->setCurrentPeriodEnd(new \DateTimeImmutable('+20 days'));
        $this->em->flush();

        return $store;
    }

    /** @return array<string, mixed> */
    private function getBilling(): array
    {
        $this->client->request('GET', '/api/admin/billing');
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testRequiresSuperAdmin(): void
    {
        $this->client->loginUser($this->fixtures->user(['ROLE_STORE_OWNER']));
        $this->client->request('GET', '/api/admin/billing');

        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testSummaryCountsOnlyPaidPlansAndExcludesFree(): void
    {
        $this->paidStore(Store::SUBSCRIPTION_ACTIVE, 'pro');
        $this->paidStore(Store::SUBSCRIPTION_PAST_DUE, 'enterprise');
        $free = $this->fixtures->store();
        $free->setPlanKey('starter')->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE);
        $this->em->flush();

        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $body = $this->getBilling();

        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame(4900, $body['summary']['mrrCents'], 'only active paid plans contribute to MRR');
        self::assertSame(19900, $body['summary']['overdueCents']);
        self::assertSame(1, $body['summary']['activeCount']);
        self::assertSame(1, $body['summary']['pastDueCount']);
        self::assertSame(1, $body['summary']['freeCount']);
        self::assertCount(2, $body['subscriptions'], 'free tiers are omitted from the billing table');
    }

    public function testRecentChargesAndMonthlyTotalsSurfaceHistory(): void
    {
        $store = $this->paidStore();
        $this->em->persist(SubscriptionCharge::paid($store, 4900, 'sqpmt_seed'));
        $this->em->flush();

        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $body = $this->getBilling();

        self::assertSame(4900, $body['summary']['collectedThisMonthCents']);
        self::assertNotEmpty($body['months']);
        self::assertSame(4900, $body['months'][0]['paidCents']);
        self::assertSame('paid', $body['recentCharges'][0]['status']);
        self::assertSame($store->getSlug(), $body['recentCharges'][0]['storeSlug']);
    }

    public function testRetryChargesAnOverdueStoreImmediately(): void
    {
        $store = $this->paidStore(Store::SUBSCRIPTION_PAST_DUE);
        $store->setCurrentPeriodEnd(new \DateTimeImmutable('-2 days'))
            ->setNextAttemptAt(new \DateTimeImmutable('+3 days'));
        $this->em->flush();

        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $this->client->request('POST', '/api/admin/billing/'.$store->getSlug().'/retry');
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('charged', $body['outcome']);
        self::assertSame(Store::SUBSCRIPTION_ACTIVE, $body['subscriptionStatus']);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(4900, $this->billing->charges[0]['amount']);

        $charges = $this->em->getRepository(SubscriptionCharge::class)->findBy(['store' => $store]);
        self::assertCount(1, $charges);
        self::assertTrue($charges[0]->isPaid());
    }

    public function testRetryOnAFreePlanIsRejected(): void
    {
        $store = $this->fixtures->store();
        $store->setPlanKey('starter');
        $this->em->flush();

        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $this->client->request('POST', '/api/admin/billing/'.$store->getSlug().'/retry');

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertSame([], $this->billing->charges);
    }
}
