<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreOrderLineTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $this->em = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @return array<string, mixed> */
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

    /** @return array{Store, InventoryItem, InventoryItem, User} */
    private function storeWithTwoListings(): array
    {
        $store = $this->fixtures->store();
        $first = $this->fixtures->inventoryItem($store, $this->fixtures->card(4101), 5, priceCents: 1000);
        $second = $this->fixtures->inventoryItem($store, $this->fixtures->card(4102), 3, priceCents: 2500);
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);

        return [$store, $first, $second, $owner];
    }

    /** @return array<string, mixed> */
    private function placeKioskOrder(Store $store, InventoryItem $item, int $quantity = 1): array
    {
        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders", [
            'channel' => 'kiosk',
            'fulfillment' => 'pickup',
            'inputLines' => [['inventoryItemId' => $item->getId(), 'quantity' => $quantity]],
        ]);
        self::assertSame(201, $this->responseCode(), (string) ($order['detail'] ?? ''));

        return $order;
    }

    public function testOwnerCanAddAndRemoveCards(): void
    {
        [$store, $first, $second, $owner] = $this->storeWithTwoListings();
        $this->authenticate($owner);
        $order = $this->placeKioskOrder($store, $first, 1);

        $updated = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
            'quantity' => 2,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($updated['detail'] ?? ''));
        self::assertCount(2, $updated['lines'] ?? []);
        self::assertSame(6000, $updated['totalCents']);

        $this->em->clear();
        $freshSecond = $this->em->getRepository(InventoryItem::class)->find($second->getId());
        self::assertSame(1, $freshSecond?->getQuantity());

        $removeId = null;
        foreach ($updated['lines'] as $line) {
            if (($line['cardName'] ?? '') === $second->getCard()?->getName()) {
                $removeId = $line['id'];
            }
        }
        self::assertNotNull($removeId);

        $afterRemove = $this->jsonRequest('DELETE', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines/{$removeId}");
        self::assertSame(200, $this->responseCode(), (string) ($afterRemove['detail'] ?? ''));
        self::assertCount(1, $afterRemove['lines'] ?? []);
        self::assertSame(1000, $afterRemove['totalCents']);

        $this->em->clear();
        $restocked = $this->em->getRepository(InventoryItem::class)->find($second->getId());
        self::assertSame(3, $restocked?->getQuantity());
    }

    public function testAddingTheSameListingIncrementsQuantity(): void
    {
        [$store, $first, , $owner] = $this->storeWithTwoListings();
        $this->authenticate($owner);
        $order = $this->placeKioskOrder($store, $first, 1);

        $updated = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $first->getId(),
            'quantity' => 2,
        ]);
        self::assertSame(200, $this->responseCode());
        self::assertCount(1, $updated['lines'] ?? []);
        self::assertSame(3, $updated['lines'][0]['quantity']);
        self::assertSame(3000, $updated['totalCents']);
    }

    public function testCannotRemoveTheLastLine(): void
    {
        [$store, $first, , $owner] = $this->storeWithTwoListings();
        $this->authenticate($owner);
        $order = $this->placeKioskOrder($store, $first, 1);
        $lineId = $order['lines'][0]['id'];

        $body = $this->jsonRequest('DELETE', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines/{$lineId}");
        self::assertSame(422, $this->responseCode());
        self::assertStringContainsString('at least one', strtolower((string) ($body['detail'] ?? '')));
    }

    public function testCannotEditACancelledOrder(): void
    {
        [$store, $first, $second, $owner] = $this->storeWithTwoListings();
        $this->authenticate($owner);
        $order = $this->placeKioskOrder($store, $first, 1);
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/orders/{$order['id']}", ['status' => 'cancelled']);
        self::assertSame(200, $this->responseCode());

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
        ]);
        self::assertSame(422, $this->responseCode());
        self::assertStringContainsString('cannot be edited', strtolower((string) ($body['detail'] ?? '')));
    }

    public function testQuantityPatchRestocksTheDifference(): void
    {
        [$store, $first, , $owner] = $this->storeWithTwoListings();
        $this->authenticate($owner);
        $order = $this->placeKioskOrder($store, $first, 3);
        $lineId = $order['lines'][0]['id'];

        $updated = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines/{$lineId}", [
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($updated['detail'] ?? ''));
        self::assertSame(1, $updated['lines'][0]['quantity']);
        self::assertSame(1000, $updated['totalCents']);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($first->getId());
        self::assertSame(4, $fresh?->getQuantity());
    }

    public function testCustomerCannotEditLines(): void
    {
        [$store, $first, $second] = $this->storeWithTwoListings();
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->authenticate($store->getOwner());
        $order = $this->placeKioskOrder($store, $first, 1);

        $this->authenticate($customer);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
        ]);
        self::assertContains($this->responseCode(), [403, 404]);
    }
}
