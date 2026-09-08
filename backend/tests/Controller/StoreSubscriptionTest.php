<?php

namespace App\Tests\Controller;

use App\Entity\PlatformDailySalesLedger;
use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Service\Billing\PlatformDailySalesAccrual;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeSubscriptionBilling;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreSubscriptionTest extends WebTestCase
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
        $this->billing->live = true;
    }

    public function testUsagePlanStatusShowsProgressAndTodaysTake(): void
    {
        $store = $this->usageStore(12_000);
        $today = (new \DateTimeImmutable('now', new \DateTimeZone(PlatformDailySalesAccrual::BUSINESS_TIMEZONE)))->setTime(0, 0);
        $ledger = new PlatformDailySalesLedger($store, $today);
        $ledger->addGrossCents(20_000);
        $this->em->persist($ledger);
        $this->em->flush();

        $payload = $this->getSubscription($store);

        self::assertResponseIsSuccessful();
        self::assertSame('usage', $payload['billingModel']);
        self::assertSame('Pay as you sell', $payload['planName']);
        self::assertSame(0, $payload['priceCents']);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $payload['capCents']);
        self::assertSame(1000, $payload['feePercentBps']);
        self::assertTrue($payload['requiresVault']);
        self::assertSame(12_000, $payload['platformFeesPaidCents']);
        self::assertSame(33_000, $payload['remainingCapCents']);
        self::assertSame(20_000, $payload['todayGrossCents']);
        self::assertSame(2_000, $payload['todayFeeCents']);
        self::assertEqualsWithDelta(10.0, (float) $payload['todayFeePercent'], 0.01);
        self::assertTrue($payload['canBuyout']);
        self::assertSame(33_000, $payload['buyoutCents']);
        self::assertFalse($payload['capReached']);
    }

    public function testBuyoutChargesRemainingCapAndKeepsUsagePlan(): void
    {
        $store = $this->usageStore(10_000);
        $beforeId = (int) $store->getId();

        $payload = $this->postBuyout($store);

        self::assertResponseIsSuccessful();
        self::assertSame('usage', $payload['planKey']);
        self::assertSame('Pay as you sell', $payload['planName']);
        self::assertFalse($payload['canBuyout']);
        self::assertTrue($payload['capReached']);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $payload['platformFeesPaidCents']);
        self::assertSame(35_000, $payload['chargedCents']);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(35_000, $this->billing->charges[0]['amount']);

        $reloaded = $this->em->find(Store::class, $beforeId);
        self::assertInstanceOf(Store::class, $reloaded);
        self::assertSame('usage', $reloaded->getPlanKey());
        self::assertTrue($reloaded->hasMetPlatformCap());
    }

    public function testBuyoutWithoutCardIsRejected(): void
    {
        $store = $this->usageStore(5_000, withCard: false);

        $payload = $this->postBuyout($store);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertSame('Save a platform payment method before paying toward this month\'s fee.', $payload['error']);
        self::assertSame([], $this->billing->charges);
    }

    public function testFlatPlanCannotBuyout(): void
    {
        $store = $this->fixtures->store('flat-buyout-store');
        $store->setPlanKey('flat')
            ->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE)
            ->setPaymentCustomerId('CUST1')
            ->setPaymentCardId('ccof:CARD1')
            ->markPlatformCapReached();
        $this->em->flush();

        $payload = $this->postBuyout($store);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertSame('There is nothing left to pay toward this plan.', $payload['error']);
    }

    public function testCustomAmountAppliesTowardCapWithoutLeavingUsage(): void
    {
        $store = $this->usageStore(10_000);
        $beforeId = (int) $store->getId();

        $payload = $this->postBuyout($store, 5_000);

        self::assertResponseIsSuccessful();
        self::assertSame('usage', $payload['planKey']);
        self::assertTrue($payload['canBuyout']);
        self::assertFalse($payload['capReached']);
        self::assertSame(15_000, $payload['platformFeesPaidCents']);
        self::assertSame(30_000, $payload['remainingCapCents']);
        self::assertSame(5_000, $payload['chargedCents']);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(5_000, $this->billing->charges[0]['amount']);

        $reloaded = $this->em->find(Store::class, $beforeId);
        self::assertInstanceOf(Store::class, $reloaded);
        self::assertSame('usage', $reloaded->getPlanKey());
        self::assertSame(15_000, $reloaded->getPlatformFeesPaidCents());
    }

    public function testCustomAmountEqualToRemainingPaysMonthWithoutSwitchingPlan(): void
    {
        $store = $this->usageStore(40_000);

        $payload = $this->postBuyout($store, 5_000);

        self::assertResponseIsSuccessful();
        self::assertSame('usage', $payload['planKey']);
        self::assertTrue($payload['capReached']);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $payload['platformFeesPaidCents']);
        self::assertSame(5_000, $this->billing->charges[0]['amount']);
        self::assertSame('usage', $store->getPlanKey());
        self::assertTrue($store->hasMetPlatformCap());
    }

    public function testCustomAmountOverRemainingIsRejected(): void
    {
        $store = $this->usageStore(10_000);

        $payload = $this->postBuyout($store, 40_000);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertSame('That is more than the remaining $350.00 toward this month\'s platform fee.', $payload['error']);
        self::assertSame([], $this->billing->charges);
    }

    public function testSquareSourceWithTokenChargesTowardCap(): void
    {
        $store = $this->usageStore(10_000, withCard: false);
        $this->connectProcessor($store, StorePaymentAccount::PROVIDER_SQUARE);

        $payload = $this->postBuyout($store, 5_000, [
            'source' => 'square',
            'token' => 'tok_square_1',
        ]);

        self::assertResponseIsSuccessful();
        self::assertSame(15_000, $payload['platformFeesPaidCents']);
        self::assertSame('usage', $payload['planKey']);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(5_000, $this->billing->charges[0]['amount']);
    }

    public function testSquareSourceUsesCardOnFileWhenConnected(): void
    {
        $store = $this->usageStore(10_000);
        $this->connectProcessor($store, StorePaymentAccount::PROVIDER_SQUARE);

        $payload = $this->postBuyout($store, 5_000, ['source' => 'square']);

        self::assertResponseIsSuccessful();
        self::assertSame(15_000, $payload['platformFeesPaidCents']);
        self::assertSame(5_000, $this->billing->charges[0]['amount']);
    }

    public function testSquareSourceWithoutAccountIsRejected(): void
    {
        $store = $this->usageStore(10_000, withCard: false);

        $payload = $this->postBuyout($store, 5_000, ['source' => 'square']);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertSame('Connect Square or save a card on file before charging Square.', $payload['error']);
        self::assertSame([], $this->billing->charges);
    }

    public function testFlatPlanStatusShowsPaidInFull(): void
    {
        $store = $this->fixtures->store('flat-status-'.bin2hex(random_bytes(2)));
        $store->setPlanKey('flat')
            ->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE)
            ->setPaymentCustomerId('CUST1')
            ->setPaymentCardId('ccof:CARD1')
            ->setPaymentLast4('1111')
            ->markPlatformCapReached();
        $this->em->flush();

        $payload = $this->getSubscription($store);

        self::assertResponseIsSuccessful();
        self::assertSame('flat', $payload['billingModel']);
        self::assertSame('Pay in full', $payload['planName']);
        self::assertTrue($payload['capReached']);
        self::assertFalse($payload['canBuyout']);
        self::assertFalse($payload['requiresVault']);
        self::assertSame(0, $payload['remainingCapCents']);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $payload['platformFeesPaidCents']);
    }

    public function testUpdatePaymentMethodReplacesCardAndClearsDunning(): void
    {
        $store = $this->usageStore(5_000);
        $store->setSubscriptionStatus(Store::SUBSCRIPTION_PAST_DUE)
            ->setNextAttemptAt(new \DateTimeImmutable('+3 days'));
        $this->em->flush();

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/subscription/payment-method', $store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer($store),
            ],
            content: json_encode([
                'methodType' => 'card',
                'token' => 'tok_new_card',
            ]),
        );
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);

        self::assertResponseIsSuccessful();
        self::assertSame('4242', $payload['paymentLast4']);
        self::assertSame(Store::SUBSCRIPTION_PAST_DUE, $payload['subscriptionStatus']);
        self::assertSame('ccof:CARD2', $store->getPaymentCardId());
        self::assertNull($store->getNextAttemptAt());
    }

    public function testBuyoutDeclineDoesNotChangeCapProgress(): void
    {
        $store = $this->usageStore(10_000);
        $this->billing->declineWith = 'Card declined.';

        $payload = $this->postBuyout($store, 5_000);

        self::assertSame(502, $this->client->getResponse()->getStatusCode());
        self::assertSame('Card declined.', $payload['error'] ?? null);
        self::assertSame(10_000, $store->getPlatformFeesPaidCents());
        self::assertSame('usage', $store->getPlanKey());
    }

    /**
     * @return array<string, mixed>
     */
    private function getSubscription(Store $store): array
    {
        $this->client->request(
            'GET',
            sprintf('/api/stores/%s/subscription', $store->getSlug()),
            server: [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer($store),
            ],
        );

        return json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<string, mixed> $extra
     *
     * @return array<string, mixed>
     */
    private function postBuyout(Store $store, ?int $amountCents = null, array $extra = []): array
    {
        $body = $extra;
        if (null !== $amountCents) {
            $body['amountCents'] = $amountCents;
        }

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/subscription/buyout', $store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer($store),
            ],
            content: json_encode([] === $body ? new \stdClass() : $body),
        );

        $raw = (string) $this->client->getResponse()->getContent();

        return '' === $raw ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    }

    private function usageStore(int $paidCents, bool $withCard = true): Store
    {
        $store = $this->fixtures->store('usage-sub-'.bin2hex(random_bytes(3)));
        $store->setPlanKey('usage')
            ->setSubscriptionStatus(Store::SUBSCRIPTION_ACTIVE)
            ->addPlatformFeesPaid($paidCents);
        if ($withCard) {
            $store->setPaymentCustomerId('CUST1')
                ->setPaymentCardId('ccof:CARD1')
                ->setPaymentLast4('1111')
                ->setPaymentMethodType('card');
        }
        $this->em->flush();

        return $store;
    }

    private function connectProcessor(Store $store, string $provider): void
    {
        $account = (new StorePaymentAccount())
            ->setStore($store)
            ->setProvider($provider)
            ->markConnected();
        $this->em->persist($account);
        $this->em->flush();
    }

    private function bearer(Store $store): string
    {
        return static::getContainer()->get(JWTTokenManagerInterface::class)->create($store->getOwner());
    }
}
