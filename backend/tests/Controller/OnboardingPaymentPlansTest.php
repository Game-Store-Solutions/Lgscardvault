<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakePaypalSubscriptionBilling;
use App\Tests\Support\FakeSubscriptionBilling;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Owner onboarding payment paths: flat ($450 once), usage (vault / $1 PayPal), declines.
 */
final class OnboardingPaymentPlansTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakeSubscriptionBilling $billing;
    private FakePaypalSubscriptionBilling $paypalBilling;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->billing = $c->get(SubscriptionBillingInterface::class);
        $this->paypalBilling = $c->get(FakePaypalSubscriptionBilling::class);
        $this->billing->charges = [];
        $this->billing->declineWith = null;
        $this->billing->live = true;
        $this->paypalBilling->charges = [];
        $this->paypalBilling->declineWith = null;
        $this->paypalBilling->live = true;
    }

    public function testFlatPlanChargesFullCapAndMarksPaidInFull(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);
        $slug = 'flat-pay-'.bin2hex(random_bytes(3));

        $created = $this->submit($slug, 'flat', [
            'payment' => [
                'methodType' => 'card',
                'token' => 'tok_flat_1',
                'last4' => '1111',
            ],
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertSame('flat', $created['planKey'] ?? null);
        self::assertCount(1, $this->billing->charges);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $this->billing->charges[0]['amount']);

        $store = $this->em->getRepository(Store::class)->findOneBy(['slug' => $slug]);
        self::assertInstanceOf(Store::class, $store);
        self::assertTrue($store->hasMetPlatformCap());
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $store->getPlatformFeesPaidCents());
        self::assertSame(Store::BILLING_SQUARE, $store->getBillingProvider());
        self::assertNotNull($store->getCurrentPeriodEnd());
        self::assertLessThanOrEqual(
            (new \DateTimeImmutable('last day of this month', new \DateTimeZone('America/Los_Angeles')))->setTime(23, 59, 59)->modify('+2 days'),
            $store->getCurrentPeriodEnd(),
        );

        $charges = $this->em->getRepository(SubscriptionCharge::class)->findBy(['store' => $store]);
        self::assertCount(1, $charges);
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $charges[0]->getAmountCents());
        self::assertTrue($charges[0]->isPaid());
    }

    public function testUsagePlanVaultsCardWithoutUpfrontCharge(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);
        $slug = 'usage-vault-'.bin2hex(random_bytes(3));

        $created = $this->submit($slug, 'usage', [
            'payment' => [
                'methodType' => 'card',
                'token' => 'tok_usage_1',
            ],
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertSame('usage', $created['planKey'] ?? null);
        self::assertSame([], $this->billing->charges, 'Usage Square path vaults only — no capture yet.');

        $store = $this->em->getRepository(Store::class)->findOneBy(['slug' => $slug]);
        self::assertInstanceOf(Store::class, $store);
        self::assertFalse($store->hasMetPlatformCap());
        self::assertSame(0, $store->getPlatformFeesPaidCents());
        self::assertSame('CUST1', $store->getPaymentCustomerId());
        self::assertSame('ccof:WALLET1', $store->getPaymentCardId());
        self::assertSame(Store::SUBSCRIPTION_ACTIVE, $store->getSubscriptionStatus());
    }

    public function testUsagePlanPaypalCapturesOneDollarVault(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);
        $slug = 'usage-pp-'.bin2hex(random_bytes(3));

        $created = $this->submit($slug, 'usage', [
            'payment' => [
                'methodType' => 'paypal',
                'token' => 'ORDER_USAGE_1',
            ],
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertCount(1, $this->paypalBilling->charges);
        self::assertSame(100, $this->paypalBilling->charges[0]['amount']);

        $store = $this->em->getRepository(Store::class)->findOneBy(['slug' => $slug]);
        self::assertInstanceOf(Store::class, $store);
        self::assertSame(Store::BILLING_PAYPAL, $store->getBillingProvider());
        self::assertFalse($store->hasMetPlatformCap());

        $charges = $this->em->getRepository(SubscriptionCharge::class)->findBy(['store' => $store]);
        self::assertCount(1, $charges);
        self::assertSame(100, $charges[0]->getAmountCents());
    }

    public function testFlatPlanPaypalChargesFullCap(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);
        $slug = 'flat-pp-'.bin2hex(random_bytes(3));

        $created = $this->submit($slug, 'flat', [
            'payment' => [
                'methodType' => 'paypal',
                'token' => 'ORDER_FLAT_1',
            ],
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertSame(PlanCatalog::PLATFORM_CAP_CENTS, $this->paypalBilling->charges[0]['amount']);

        $store = $this->em->getRepository(Store::class)->findOneBy(['slug' => $slug]);
        self::assertInstanceOf(Store::class, $store);
        self::assertTrue($store->hasMetPlatformCap());
        self::assertSame(Store::BILLING_PAYPAL, $store->getBillingProvider());
    }

    public function testPaidPlanWithoutPaymentIsRejected(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);

        $body = $this->submit('need-pay-'.bin2hex(random_bytes(3)), 'flat');

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('payment method', strtolower((string) ($body['error'] ?? '')));
        self::assertSame([], $this->billing->charges);
    }

    public function testCardDeclineSurfacesAsBadGatewayWithoutCreatingStore(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);
        $this->billing->declineWith = 'Card declined.';
        $slug = 'declined-'.bin2hex(random_bytes(3));

        $body = $this->submit($slug, 'flat', [
            'payment' => [
                'methodType' => 'card',
                'token' => 'tok_bad',
            ],
        ]);

        self::assertSame(502, $this->client->getResponse()->getStatusCode());
        self::assertSame('Card declined.', $body['error'] ?? null);
        self::assertNull($this->em->getRepository(Store::class)->findOneBy(['slug' => $slug]));
    }

    /**
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    private function submit(string $slug, string $planKey, array $overrides = []): array
    {
        $payload = array_replace_recursive([
            'name' => 'Payment Test Store',
            'slug' => $slug,
            'planKey' => $planKey,
            'phone' => '4155550199',
            'acceptedMerchantTerms' => true,
            'compliance' => [
                'legalBusinessName' => 'Payment Test LLC',
                'entityType' => 'llc',
                'sellerPermitNumber' => 'SR-CA-99',
                'insuranceAttested' => true,
            ],
            'address' => [
                'addressLine1' => '100 Market St',
                'city' => 'San Francisco',
                'region' => 'CA',
                'postalCode' => '94103',
                'country' => 'US',
            ],
        ], $overrides);

        $server = [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
        ];
        $this->client->request('POST', '/api/onboarding/store', server: $server, content: json_encode($payload));
        $raw = (string) $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function authenticate(\App\Entity\User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }
}
