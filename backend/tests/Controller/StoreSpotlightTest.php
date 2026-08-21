<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreSpotlightTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private Store $store;
    private string $bearer;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->store = $this->fixtures->store('spotlight-custom-store');
        $this->bearer = $c->get(JWTTokenManagerInterface::class)->create($this->store->getOwner());
    }

    /** @param array<string, mixed> $body */
    private function patchSettings(array $body): array
    {
        $this->client->request(
            'PATCH',
            sprintf('/api/stores/%s/settings', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode($body),
        );
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testSpotlightSettingsPersistAndPinnedCardsLeadTheRail(): void
    {
        $cheap = $this->fixtures->inventoryItem($this->store, $this->fixtures->card(11), priceCents: 200);
        $mid = $this->fixtures->inventoryItem($this->store, $this->fixtures->card(12), priceCents: 1500);
        $pricey = $this->fixtures->inventoryItem($this->store, $this->fixtures->card(13), priceCents: 4000);
        $pinned = $this->fixtures->inventoryItem($this->store, $this->fixtures->card(14), priceCents: 300);

        $saved = $this->patchSettings([
            'spotlightMinPriceCents' => 1000,
            'spotlightMinItems' => 2,
            'spotlightMaxItems' => 3,
            'spotlightPinnedInventoryIds' => [$pinned->getId(), 999999],
        ]);

        self::assertSame(1000, $saved['spotlightMinPriceCents']);
        self::assertSame(2, $saved['spotlightMinItems']);
        self::assertSame(3, $saved['spotlightMaxItems']);
        self::assertSame([$pinned->getId()], $saved['spotlightPinnedInventoryIds']);

        $this->client->request('GET', sprintf('/api/stores/%s/spotlight', $this->store->getSlug()));
        self::assertResponseIsSuccessful();
        $rail = json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        $ids = array_map(static fn (array $item): int => (int) $item['id'], $rail['items'] ?? []);

        self::assertSame(3, $rail['total'] ?? null);
        self::assertSame($pinned->getId(), $ids[0] ?? null);
        self::assertContains($pricey->getId(), $ids);
        self::assertContains($mid->getId(), $ids);
        self::assertNotContains($cheap->getId(), $ids);
    }

    public function testMinItemsFillsBelowThePriceFloor(): void
    {
        $this->fixtures->inventoryItem($this->store, $this->fixtures->card(21), priceCents: 2500);
        $filler = $this->fixtures->inventoryItem($this->store, $this->fixtures->card(22), priceCents: 400);

        $this->patchSettings([
            'spotlightMinPriceCents' => 1000,
            'spotlightMinItems' => 2,
            'spotlightMaxItems' => 8,
            'spotlightPinnedInventoryIds' => [],
        ]);

        $this->client->request('GET', sprintf('/api/stores/%s/spotlight', $this->store->getSlug()));
        self::assertResponseIsSuccessful();
        $rail = json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        $ids = array_map(static fn (array $item): int => (int) $item['id'], $rail['items'] ?? []);

        self::assertCount(2, $ids);
        self::assertContains($filler->getId(), $ids);
    }
}
