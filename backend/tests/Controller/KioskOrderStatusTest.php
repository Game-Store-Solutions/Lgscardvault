<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Service\Store\KioskSessionToken;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * In-store kiosk orders land in Ready for pickup (fulfilled) so staff pull
 * from that queue — the customer is already at the counter.
 */
final class KioskOrderStatusTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @param array<string, mixed>|null $body */
    private function jsonRequest(string $method, string $url, ?array $body = null, string $contentType = 'application/json'): array
    {
        $server = ['CONTENT_TYPE' => $contentType];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));

        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testTerminalKioskOrderStartsReadyForPickup(): void
    {
        $store = $this->fixtures->store('kiosk-ready-terminal');
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(9201), 2, priceCents: 1500);
        $token = static::getContainer()->get(KioskSessionToken::class)->issue($store);

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/kiosk/order', $store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_KIOSK_SESSION' => $token,
            ],
            content: json_encode([
                'customerName' => 'Walk-up Customer',
                'fulfillment' => 'pickup',
                'sessionToken' => $token,
                'lines' => [['inventoryItemId' => $item->getId(), 'quantity' => 1]],
            ]),
        );

        self::assertResponseStatusCodeSame(201);
        $order = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('fulfilled', $order['status']);
        self::assertSame('kiosk', $order['channel']);
    }

    public function testAdminKioskCreateStartsReadyForPickup(): void
    {
        $store = $this->fixtures->store('kiosk-ready-admin');
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(9202), 2, priceCents: 2000);
        $this->authenticate($store->getOwner());

        $order = $this->jsonRequest('POST', sprintf('/api/stores/%s/orders', $store->getSlug()), [
            'channel' => 'kiosk',
            'fulfillment' => 'pickup',
            'inputLines' => [['inventoryItemId' => $item->getId(), 'quantity' => 1]],
        ]);

        self::assertResponseIsSuccessful();
        self::assertSame('fulfilled', $order['status']);
        self::assertSame('kiosk', $order['channel']);
    }

    public function testOnlineOrderStillStartsPending(): void
    {
        $store = $this->fixtures->store('kiosk-ready-online');
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(9203), 1, priceCents: 1000);
        $this->authenticate($store->getOwner());

        $order = $this->jsonRequest('POST', sprintf('/api/stores/%s/orders', $store->getSlug()), [
            'channel' => 'online',
            'fulfillment' => 'pickup',
            'inputLines' => [['inventoryItemId' => $item->getId(), 'quantity' => 1]],
        ]);

        self::assertResponseIsSuccessful();
        self::assertSame('pending', $order['status']);
    }
}
