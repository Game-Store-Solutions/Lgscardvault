<?php

namespace App\Tests\Controller;

use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Store-scoped commander recommendations: only in-stock, color-identity-legal
 * synergies are returned, ready for individual / bulk add-to-cart.
 */
final class CommanderRecommendControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    public function testRecommendReturnsInStockSynergiesAndExcludesIllegalColors(): void
    {
        $store = $this->fixtures->store('synergy-store');

        $commander = $this->fixtures->card(700, [
            'name' => 'Atraxa Test',
            'type_line' => 'Legendary Creature — Phyrexian Angel Horror',
            'oracle_text' => 'At the beginning of your end step, proliferate.',
            'keywords' => ['Flying', 'Proliferate'],
            'color_identity' => ['W', 'U', 'B', 'G'],
            'mana_cost' => '{G}{W}{U}{B}',
            'cmc' => 4,
            'legalities' => ['commander' => 'legal'],
        ]);

        $synergy = $this->fixtures->card(701, [
            'name' => 'Proliferate Buddy',
            'type_line' => 'Creature — Phyrexian',
            'oracle_text' => 'Whenever you proliferate, draw a card.',
            'keywords' => ['Proliferate'],
            'color_identity' => ['U'],
            'mana_cost' => '{1}{U}',
            'cmc' => 2,
            'legalities' => ['commander' => 'legal'],
        ]);

        $wrongColor = $this->fixtures->card(702, [
            'name' => 'Red Proliferator',
            'type_line' => 'Creature — Wizard',
            'oracle_text' => 'Proliferate at the beginning of combat.',
            'keywords' => ['Proliferate'],
            'color_identity' => ['R'],
            'mana_cost' => '{1}{R}',
            'cmc' => 2,
            'legalities' => ['commander' => 'legal'],
        ]);

        $this->fixtures->inventoryItem($store, $synergy, quantity: 3, priceCents: 250);
        $this->fixtures->inventoryItem($store, $wrongColor, quantity: 5, priceCents: 100);
        $this->fixtures->inventoryItem($store, $commander, quantity: 1, priceCents: 4000);
        $this->em->flush();

        $this->client->request('GET', sprintf(
            '/api/stores/%s/recommend/commander/%s',
            $store->getSlug(),
            $commander->getId(),
        ));
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $payload = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame('Atraxa Test', $payload['commander']['name']);
        self::assertSame('WUBG', $payload['identityCode']);

        $names = array_map(
            static fn (array $row): string => $row['inventoryItem']['card']['name'],
            $payload['recommendations'],
        );
        self::assertContains('Proliferate Buddy', $names);
        self::assertNotContains('Red Proliferator', $names, 'outside color identity must be filtered');
        self::assertNotContains('Atraxa Test', $names, 'commander itself is not recommended');

        $buddy = null;
        foreach ($payload['recommendations'] as $row) {
            if ('Proliferate Buddy' === $row['inventoryItem']['card']['name']) {
                $buddy = $row;
                break;
            }
        }
        self::assertNotNull($buddy);
        self::assertGreaterThan(0.0, $buddy['score']);
        self::assertContains('proliferate', $buddy['reasons']);
        self::assertSame(3, $buddy['inventoryItem']['quantity']);
        self::assertArrayHasKey('id', $buddy['inventoryItem'], 'inventory id is required for cart PUT');
    }

    public function testCommanderSearchUsesCommandersCatalogNotInventory(): void
    {
        $store = $this->fixtures->store('cmd-search-store');
        $krenko = $this->fixtures->card(710, [
            'name' => 'Krenko Searchable',
            'type_line' => 'Legendary Creature — Goblin',
            'color_identity' => ['R'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $this->fixtures->card(711, [
            'name' => 'Not A Commander',
            'type_line' => 'Creature — Goblin',
            'color_identity' => ['R'],
        ]);
        // Not in inventory — must still be searchable via commanders table.
        $commander = new \App\Entity\Commander($krenko->getOracleId(), $krenko);
        $commander->syncFromCard($krenko);
        $this->em->persist($commander);
        $this->em->flush();

        $this->client->request('GET', '/api/stores/'.$store->getSlug().'/recommend/commanders?q=Krenko');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $payload = json_decode($this->client->getResponse()->getContent(), true);
        $names = array_column($payload, 'name');
        self::assertContains('Krenko Searchable', $names);
        self::assertNotContains('Not A Commander', $names);
        self::assertSame((string) $krenko->getId(), $payload[0]['id']);
    }

    public function testBulkCartAcceptsRecommendedInventoryIds(): void
    {
        $store = $this->fixtures->store('bulk-cart-store');
        $customer = $this->fixtures->user(['ROLE_USER']);
        $commander = $this->fixtures->card(720, [
            'name' => 'Bulk Commander',
            'type_line' => 'Legendary Creature — Human',
            'oracle_text' => 'Create a 1/1 goblin token. Goblins you control get +1/+1.',
            'color_identity' => ['R'],
            'keywords' => [],
            'legalities' => ['commander' => 'legal'],
        ]);
        $a = $this->fixtures->card(721, [
            'name' => 'Goblin A',
            'type_line' => 'Creature — Goblin',
            'oracle_text' => 'Other Goblin creatures you control get +1/+1.',
            'color_identity' => ['R'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $b = $this->fixtures->card(722, [
            'name' => 'Goblin B',
            'type_line' => 'Creature — Goblin',
            'oracle_text' => 'When this goblin enters, create a goblin token.',
            'color_identity' => ['R'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $itemA = $this->fixtures->inventoryItem($store, $a, quantity: 4, priceCents: 150);
        $itemB = $this->fixtures->inventoryItem($store, $b, quantity: 2, priceCents: 200);
        $this->em->flush();

        $this->client->request('GET', sprintf(
            '/api/stores/%s/recommend/commander/%s',
            $store->getSlug(),
            $commander->getId(),
        ));
        $recs = json_decode($this->client->getResponse()->getContent(), true)['recommendations'];
        self::assertGreaterThanOrEqual(2, count($recs));

        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($customer);
        foreach ($recs as $row) {
            $id = $row['inventoryItem']['id'];
            $this->client->request(
                'PUT',
                sprintf('/api/stores/%s/customer/cart/%d', $store->getSlug(), $id),
                server: [
                    'CONTENT_TYPE' => 'application/json',
                    'HTTP_AUTHORIZATION' => 'Bearer '.$token,
                ],
                content: json_encode(['quantity' => 1]),
            );
            self::assertContains(
                $this->client->getResponse()->getStatusCode(),
                [200, 201],
                'cart upsert for inventory '.$id,
            );
        }

        $this->client->request(
            'GET',
            sprintf('/api/stores/%s/customer/cart', $store->getSlug()),
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$token],
        );
        $cart = json_decode($this->client->getResponse()->getContent(), true);
        self::assertGreaterThanOrEqual(2, count($cart));
        $cartIds = array_map(static fn (array $line) => $line['inventoryItem']['id'] ?? null, $cart);
        self::assertContains($itemA->getId(), $cartIds);
        self::assertContains($itemB->getId(), $cartIds);
    }
}
