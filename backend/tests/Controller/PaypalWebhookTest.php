<?php

namespace App\Tests\Controller;

use App\Entity\StorePaymentAccount;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class PaypalWebhookTest extends WebTestCase
{
    private const URL = '/api/integrations/paypal/webhook';
    private const WEBHOOK_ID = 'test-paypal-webhook-id';

    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $this->em = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    /** @param array<string, mixed> $payload */
    private function send(array $payload, bool $sign = true): array
    {
        $body = json_encode($payload, \JSON_THROW_ON_ERROR);
        $server = ['CONTENT_TYPE' => 'application/json'];
        if ($sign) {
            $server['HTTP_PAYPAL_TRANSMISSION_SIG'] = base64_encode(hash_hmac('sha256', $body, self::WEBHOOK_ID, true));
        }

        $this->client->request('POST', self::URL, server: $server, content: $body);
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testUnsignedWebhookIsRejected(): void
    {
        $this->send(['id' => 'WH-1', 'event_type' => 'PAYMENT.CAPTURE.REFUNDED'], sign: false);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());
    }

    public function testRevocationDisconnectsPaypalAccount(): void
    {
        $store = $this->fixtures->store();
        $account = (new StorePaymentAccount())
            ->setStore($store)
            ->setProvider(StorePaymentAccount::PROVIDER_PAYPAL)
            ->setProviderMerchantId('PAYPALMERCHANT1')
            ->setEnvironment('sandbox')
            ->markConnected();
        $this->em->persist($account);
        $this->em->flush();

        $result = $this->send([
            'id' => 'WH-REVOKE-1',
            'event_type' => 'MERCHANT.PARTNER-CONSENT.REVOKED',
            'resource' => ['merchant_id' => 'PAYPALMERCHANT1'],
        ]);

        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('processed', $result['status']);

        $this->em->clear();
        $fresh = $this->em->getRepository(StorePaymentAccount::class)->find($account->getId());
        self::assertSame(StorePaymentAccount::STATUS_DISCONNECTED, $fresh->getStatus());
    }

    public function testDuplicateEventIsIgnored(): void
    {
        $payload = [
            'id' => 'WH-DUP-1',
            'event_type' => 'CUSTOMER.DISPUTE.CREATED',
            'resource' => ['reason' => 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED'],
        ];
        $this->send($payload);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $again = $this->send($payload);
        self::assertSame('duplicate', $again['status']);
    }
}
