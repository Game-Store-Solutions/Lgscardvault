<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\Store;
use App\Entity\User;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeCheckoutGateway;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class GuestCheckoutTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakeCheckoutGateway $gateway;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->gateway = $container->get(CheckoutGatewayInterface::class);
    }

    /** @return array<string, mixed> */
    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $this->client->request(
            $method,
            $url,
            server: ['CONTENT_TYPE' => 'application/json'],
            content: null === $body ? '' : json_encode($body),
        );
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testGuestCheckoutRequiresName(): void
    {
        [$store, $item] = $this->storeWithStockedListing();
        $this->gateway->ready = true;

        $response = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/checkout", [
            'customerName' => '   ',
            'lines' => [['inventoryItemId' => $item->getId(), 'quantity' => 1]],
            'token' => 'fake-nonce',
        ]);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('name', strtolower((string) ($response['detail'] ?? '')));
    }

    public function testGuestCheckoutChargesAndCreatesPaidOrder(): void
    {
        [$store, $item] = $this->storeWithStockedListing(stock: 3, priceCents: 900);
        $this->gateway->ready = true;
        $this->gateway->declineWith = null;

        $beforeStock = $item->getQuantity();

        $response = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/checkout", [
            'customerName' => 'Walk-in Pat',
            'customerEmail' => 'pat@example.com',
            'fulfillment' => Order::FULFILLMENT_PICKUP,
            'lines' => [['inventoryItemId' => $item->getId(), 'quantity' => 2]],
            'token' => 'fake-nonce',
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('paid', $response['status'] ?? null);
        self::assertSame('Walk-in Pat', $response['customerName'] ?? null);

        $this->em->refresh($item);
        self::assertSame($beforeStock - 2, $item->getQuantity());
    }

    public function testGuestPayInStoreWhenSquareIsReady(): void
    {
        [$store, $item] = $this->storeWithStockedListing(stock: 2, priceCents: 500);
        $this->gateway->ready = true;

        $response = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/checkout/pay-in-store", [
            'customerName' => 'Guest Shopper',
            'fulfillment' => Order::FULFILLMENT_PICKUP,
            'lines' => [['inventoryItemId' => $item->getId(), 'quantity' => 1]],
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('Guest Shopper', $response['customerName'] ?? null);
        self::assertNotSame('paid', $response['status'] ?? null);
    }

    /** @return array{Store, InventoryItem} */
    private function storeWithStockedListing(int $stock = 5, int $priceCents = 2500): array
    {
        $store = $this->fixtures->store();
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(902), $stock, priceCents: $priceCents);

        return [$store, $item];
    }
}
