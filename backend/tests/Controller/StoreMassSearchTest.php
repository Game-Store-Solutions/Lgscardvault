<?php

namespace App\Tests\Controller;

use App\Controller\StoreMassSearchController;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreMassSearchTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    /** @return array<string, mixed>|list<mixed> */
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

    public function testMassSearchIsPublicAndReturnsMatchingListings(): void
    {
        $store = $this->fixtures->store();
        $bolt = $this->fixtures->card(601, ['name' => 'Lightning Bolt', 'set' => 'lea']);
        $dfc = $this->fixtures->card(602, ['name' => 'Fire // Ice', 'set' => 'apc']);
        $miss = $this->fixtures->card(603, ['name' => 'Ancestral Recall', 'set' => 'lea']);
        $this->fixtures->inventoryItem($store, $bolt, 3, priceCents: 250);
        $this->fixtures->inventoryItem($store, $dfc, 1);
        $this->fixtures->inventoryItem($store, $miss, 0);

        $payload = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory/mass-search", [
            'names' => ['lightning bolt', 'Fire', 'Ancestral Recall', 'Black Lotus'],
        ]);

        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertIsArray($payload);
        $byName = [];
        foreach ($payload as $row) {
            self::assertIsArray($row);
            $byName[(string) ($row['card']['name'] ?? '')] = $row;
        }
        self::assertCount(2, $byName);
        self::assertArrayHasKey('Lightning Bolt', $byName);
        self::assertArrayHasKey('Fire // Ice', $byName);
        self::assertSame(3, $byName['Lightning Bolt']['quantity']);
        self::assertArrayHasKey('isFoil', $byName['Lightning Bolt']);
        self::assertArrayNotHasKey('oracleText', $byName['Lightning Bolt']['card'] ?? []);
    }

    public function testMassSearchUnknownStoreIs404(): void
    {
        $this->jsonRequest('POST', '/api/stores/no-such-store/inventory/mass-search', ['names' => ['Bolt']]);

        self::assertSame(404, $this->client->getResponse()->getStatusCode());
    }

    public function testMassSearchRejectsNonArrayNames(): void
    {
        $store = $this->fixtures->store();
        $payload = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory/mass-search", [
            'names' => 'Lightning Bolt',
        ]);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('names', strtolower((string) ($payload['detail'] ?? '')));
    }

    public function testMassSearchRejectsOversizedNameList(): void
    {
        $store = $this->fixtures->store();
        $names = array_map(static fn (int $i): string => 'Card '.$i, range(1, StoreMassSearchController::MAX_NAMES + 1));
        $payload = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory/mass-search", [
            'names' => $names,
        ]);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString((string) StoreMassSearchController::MAX_NAMES, (string) ($payload['detail'] ?? ''));
    }

    public function testMassSearchInvalidJsonIs400(): void
    {
        $store = $this->fixtures->store();
        $this->client->request(
            'POST',
            "/api/stores/{$store->getSlug()}/inventory/mass-search",
            server: ['CONTENT_TYPE' => 'application/json'],
            content: '{not-json',
        );

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }
}
