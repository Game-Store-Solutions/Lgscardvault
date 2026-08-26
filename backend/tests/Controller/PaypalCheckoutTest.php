<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Entity\User;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\PaypalCheckoutGatewayInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeCheckoutGateway;
use App\Tests\Support\FakePaypalCheckoutGateway;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class PaypalCheckoutTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakeCheckoutGateway $square;
    private FakePaypalCheckoutGateway $paypal;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->square = $container->get(CheckoutGatewayInterface::class);
        $this->paypal = $container->get(PaypalCheckoutGatewayInterface::class);
        $this->square->ready = false;
        $this->square->declineWith = null;
        $this->square->addedTaxCents = 0;
        $this->paypal->ready = true;
        $this->paypal->declineWith = null;
        $this->paypal->charges = [];
        $this->paypal->orders = [];
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function responseCode(): int
    {
        return $this->client->getResponse()->getStatusCode();
    }

    /** @return array{Store, InventoryItem, User} */
    private function storeWithStockedListing(int $stock = 5, int $priceCents = 2500): array
    {
        $store = $this->fixtures->store();
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(902), $stock, priceCents: $priceCents);
        $customer = $this->fixtures->user(['ROLE_USER']);

        return [$store, $item, $customer];
    }

    private function fillCart(Store $store, User $customer, InventoryItem $item, int $quantity): void
    {
        $this->authenticate($customer);
        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$item->getId()}", ['quantity' => $quantity]);
        self::assertResponseIsSuccessful();
    }

    public function testConfigExposesPaypalWithoutSecrets(): void
    {
        [$store, , $customer] = $this->storeWithStockedListing();
        $this->authenticate($customer);

        $config = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/customer/checkout/config");

        self::assertResponseIsSuccessful();
        self::assertTrue($config['paypal']['enabled']);
        self::assertSame('PAYPALMERCHANT1', $config['paypal']['merchantId']);
        self::assertArrayNotHasKey('accessToken', $config['paypal']);
        self::assertArrayNotHasKey('clientSecret', $config['paypal']);
    }

    public function testPaypalCheckoutCapturesAndConsumesStock(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 2500);
        $store->setRegion('OR');
        $this->em->flush();
        $this->fillCart($store, $customer, $item, 2);

        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout/paypal/order", [
            'useStoreCredit' => false,
        ]);
        self::assertSame(200, $this->responseCode());
        self::assertSame('PAYPAL-ORDER-1', $created['orderId']);
        self::assertSame(5000, $created['dueCents']);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'pickup',
            'provider' => 'paypal',
            'token' => $created['orderId'],
        ]);

        self::assertSame(201, $this->responseCode(), (string) ($order['detail'] ?? ''));
        self::assertSame(5000, $order['paidCents']);
        self::assertSame('paypal', $order['paymentProvider']);
        self::assertCount(1, $this->paypal->charges);
        self::assertSame($created['orderId'], $this->paypal->charges[0]['paypalOrderId']);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(3, $fresh->getQuantity());
    }

    public function testPaypalDeclineRestocks(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 4, priceCents: 1000);
        $store->setRegion('OR');
        $this->em->flush();
        $this->fillCart($store, $customer, $item, 1);
        $this->paypal->declineWith = 'INSTRUMENT_DECLINED';

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'pickup',
            'provider' => 'paypal',
            'token' => 'PAYPAL-ORDER-DECLINED',
        ]);

        self::assertSame(402, $this->responseCode());
        self::assertStringContainsString('DECLINED', (string) ($body['detail'] ?? ''));

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(4, $fresh->getQuantity());
    }

    public function testPaypalConnectRequiresConfiguration(): void
    {
        $store = $this->fixtures->store();
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);
        $this->authenticate($owner);

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/payments/paypal/connect");
        self::assertSame(422, $this->responseCode());
        self::assertStringContainsString('PayPal', (string) ($body['detail'] ?? ''));
    }
}
