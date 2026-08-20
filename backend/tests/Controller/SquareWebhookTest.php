<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Entity\User;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeCheckoutGateway;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Square's asynchronous notifications.
 *
 * The endpoint is unauthenticated by necessity, so the two things under test
 * are that an unsigned caller can do nothing at all, and that a redelivery of
 * an event we already applied is a no-op rather than a second refund.
 */
final class SquareWebhookTest extends WebTestCase
{
    private const URL = '/api/integrations/square/webhook';
    private const SIGNING_KEY = 'test-webhook-signature-key';

    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakeCheckoutGateway $gateway;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->gateway = $container->get(CheckoutGatewayInterface::class);
    }

    /**
     * Signs exactly as Square does: HMAC-SHA256 over the notification URL
     * concatenated with the raw body.
     *
     * @param array<string, mixed> $payload
     */
    private function send(array $payload, bool $sign = true, ?string $signature = null): array
    {
        $body = json_encode($payload, \JSON_THROW_ON_ERROR);
        $server = ['CONTENT_TYPE' => 'application/json'];

        if ($sign) {
            $server['HTTP_X_SQUARE_HMACSHA256_SIGNATURE'] = $signature
                ?? base64_encode(hash_hmac('sha256', 'http://localhost'.self::URL.$body, self::SIGNING_KEY, true));
        }

        $this->client->request('POST', self::URL, server: $server, content: $body);
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function responseCode(): int
    {
        return $this->client->getResponse()->getStatusCode();
    }

    /**
     * @param array<string, mixed> $object
     *
     * @return array<string, mixed>
     */
    private function event(string $type, array $object, string $eventId = 'evt-1', string $merchantId = 'MERCHANT1'): array
    {
        return [
            'merchant_id' => $merchantId,
            'type' => $type,
            'event_id' => $eventId,
            'created_at' => '2026-08-05T00:00:00Z',
            'data' => ['type' => explode('.', $type)[0], 'id' => 'obj-1', 'object' => $object],
        ];
    }

    /** Places a genuine paid order so a refund has real stock to give back. */
    private function paidOrder(int $stock = 5, int $quantity = 2): array
    {
        $store = $this->fixtures->store();
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(950), $stock, priceCents: 2500);
        $customer = $this->fixtures->user(['ROLE_USER']);

        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($customer);
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer];

        $this->client->request('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$item->getId()}", server: $server, content: json_encode(['quantity' => $quantity]));
        $this->client->request('POST', "/api/stores/{$store->getSlug()}/customer/checkout", server: $server, content: json_encode(['fulfillment' => 'pickup', 'token' => 'cnon:card-nonce-ok']));

        $order = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame(201, $this->responseCode(), 'fixture order must be paid');

        $this->bearer = null;

        return [$store, $item, $order];
    }

    public function testUnsignedRequestIsRejected(): void
    {
        $this->send($this->event('refund.updated', []), sign: false);

        self::assertSame(401, $this->responseCode());
    }

    public function testForgedSignatureIsRejected(): void
    {
        $this->send($this->event('refund.updated', []), signature: base64_encode('not-the-real-mac'));

        self::assertSame(401, $this->responseCode());
    }

    public function testRefundIssuedInSquareRefundsTheOrderAndReturnsStock(): void
    {
        [, $item, $order] = $this->paidOrder(stock: 5, quantity: 2);
        $paymentId = $this->gateway->charges[0] ? 'sqpmt_1' : '';

        $body = $this->send($this->event('refund.updated', [
            'refund' => ['id' => 'rf-1', 'payment_id' => $paymentId, 'status' => 'COMPLETED', 'amount_money' => ['amount' => 5000, 'currency' => 'USD']],
        ]));

        self::assertSame(200, $this->responseCode());
        self::assertSame('processed', $body['status']);

        $this->em->clear();
        $fresh = $this->em->getRepository(Order::class)->find($order['id']);
        self::assertSame('refunded', $fresh->getStatus()->value);

        $stock = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(5, $stock->getQuantity(), 'a refund puts the stock back');
    }

    public function testRedeliveredRefundDoesNotRestockTwice(): void
    {
        [, $item, ] = $this->paidOrder(stock: 5, quantity: 2);

        $payload = $this->event('refund.updated', [
            'refund' => ['id' => 'rf-1', 'payment_id' => 'sqpmt_1', 'status' => 'COMPLETED'],
        ]);

        $this->send($payload);
        $second = $this->send($payload);

        self::assertSame('duplicate', $second['status']);

        $this->em->clear();
        $stock = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(5, $stock->getQuantity(), 'the same event must not restock twice');
    }

    public function testPendingRefundIsIgnoredUntilItCompletes(): void
    {
        [, $item, $order] = $this->paidOrder(stock: 5, quantity: 2);

        $body = $this->send($this->event('refund.updated', [
            'refund' => ['id' => 'rf-1', 'payment_id' => 'sqpmt_1', 'status' => 'PENDING'],
        ]));

        self::assertSame('ignored', $body['status']);

        $this->em->clear();
        self::assertSame('pending', $this->em->getRepository(Order::class)->find($order['id'])->getStatus()->value);
        self::assertSame(3, $this->em->getRepository(InventoryItem::class)->find($item->getId())->getQuantity());
    }

    public function testRevokedAuthorizationDisconnectsTheStore(): void
    {
        $store = $this->fixtures->store();
        $account = (new StorePaymentAccount())
            ->setStore($store)
            ->setProvider(StorePaymentAccount::PROVIDER_SQUARE)
            ->setProviderMerchantId('MERCHANT_REVOKED')
            ->setProviderLocationId('LOC1')
            ->setAccessTokenEncrypted('cipher')
            ->markConnected();
        $this->em->persist($account);
        $this->em->flush();

        $body = $this->send($this->event(
            'oauth.authorization.revoked',
            ['revocation' => ['revoked_at' => '2026-08-05T00:00:00Z', 'revoker_type' => 'MERCHANT']],
            merchantId: 'MERCHANT_REVOKED',
        ));

        self::assertSame('processed', $body['status']);

        $this->em->refresh($account);
        self::assertSame(StorePaymentAccount::STATUS_DISCONNECTED, $account->getStatus());
        self::assertNull($account->getAccessTokenEncrypted(), 'a revoked token must not be kept');
        self::assertNotNull($account->getLastError());
    }

    public function testPayInStoreQrPaymentWebhookMarksTheOrderPaid(): void
    {
        $store = $this->fixtures->store();
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(951), 5, priceCents: 1200);
        $customer = $this->fixtures->user(['ROLE_USER']);

        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($customer);
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$token];

        $this->client->request('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$item->getId()}", server: $server, content: json_encode(['quantity' => 1]));
        $this->client->request('POST', "/api/stores/{$store->getSlug()}/customer/checkout/pay-in-store", server: $server, content: json_encode(['fulfillment' => 'pickup']));

        $order = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame(201, $this->responseCode());
        self::assertSame('Paying in store', $order['notes'] ?? null);

        $this->em->clear();
        $placed = $this->em->getRepository(Order::class)->find($order['id']);
        self::assertInstanceOf(Order::class, $placed);
        $squareOrderId = $placed->getSquareOrderId();
        self::assertNotEmpty($squareOrderId);

        $body = $this->send($this->event('payment.created', [
            'payment' => [
                'id' => 'sqpmt-qr-1',
                'status' => 'COMPLETED',
                'order_id' => $squareOrderId,
                'amount_money' => ['amount' => 1200, 'currency' => 'USD'],
                'note' => 'Paying in store — '.$order['reference'],
            ],
        ], 'evt-qr-1'));

        self::assertSame(200, $this->responseCode());
        self::assertSame('processed', $body['status']);

        $this->em->clear();
        $fresh = $this->em->getRepository(Order::class)->find($order['id']);
        self::assertSame(1200, $fresh->getPaidCents());
        self::assertSame('sqpmt-qr-1', $fresh->getPaymentReference());
        self::assertNull($fresh->getNotes());
    }

    public function testUnhandledEventTypeIsAcknowledgedNotRetried(): void
    {
        $body = $this->send($this->event('inventory.count.updated', ['counts' => []]));

        self::assertSame(200, $this->responseCode(), 'acknowledging stops Square retrying for days');
        self::assertSame('ignored', $body['status']);
    }

    public function testWebhookNeedsNoAuthenticatedUser(): void
    {
        // Regression guard: the firewall must leave this path public, or Square
        // would silently receive 401s for every event.
        $this->send($this->event('inventory.count.updated', []));

        self::assertNotSame(401, $this->responseCode());
    }
}
