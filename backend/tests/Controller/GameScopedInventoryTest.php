<?php

namespace App\Tests\Controller;

use App\Entity\Game;
use App\Entity\SealedProduct;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Multi-game store navigation: inventory and search scoped to one game,
 * the store's own game list driving the switcher, and per-game CSV
 * templates. Magic must keep working for listings created before the
 * multi-game catalog, which carry no game at all.
 */
final class GameScopedInventoryTest extends WebTestCase
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

    private function authenticate(?User $user): void
    {
        $this->bearer = null === $user
            ? null
            : static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    private function jsonRequest(string $method, string $url): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }
        $this->client->request($method, $url, server: $server);
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function game(string $code): Game
    {
        $game = $this->em->getRepository(Game::class)->findOneBy(['code' => $code]);
        self::assertNotNull($game);

        return $game;
    }

    public function testInventoryCollectionIsScopedByGame(): void
    {
        $store = $this->fixtures->store();

        // A legacy Magic listing (no game row at all) and a One Piece one.
        $legacyMtg = $this->fixtures->card(8801, ['name' => 'Legacy Bolt']);
        $onePiece = $this->fixtures->card(8802, ['name' => 'Monkey.D.Luffy']);
        $onePiece->setGame($this->game('onepiece'));
        $this->fixtures->inventoryItem($store, $legacyMtg, 2);
        $this->fixtures->inventoryItem($store, $onePiece, 3);
        $this->em->flush();

        $base = "/api/stores/{$store->getSlug()}/inventory";

        $all = $this->jsonRequest('GET', $base);
        self::assertCount(2, $all['member'] ?? $all);

        // Magic includes the legacy NULL-game listing — the whole point.
        $mtg = $this->jsonRequest('GET', $base.'?game=mtg');
        $mtgItems = $mtg['member'] ?? $mtg;
        self::assertCount(1, $mtgItems);
        self::assertSame('Legacy Bolt', $mtgItems[0]['card']['name']);
        self::assertSame('mtg', $mtgItems[0]['card']['gameCode']);

        $op = $this->jsonRequest('GET', $base.'?game=onepiece');
        $opItems = $op['member'] ?? $op;
        self::assertCount(1, $opItems);
        self::assertSame('Monkey.D.Luffy', $opItems[0]['card']['name']);

        // The keyset walk the frontend uses honors the same scope.
        $keyset = $this->jsonRequest('GET', $base.'?afterId=0&itemsPerPage=100&game=onepiece');
        self::assertCount(1, $keyset['member'] ?? $keyset);

        self::assertCount(0, ($this->jsonRequest('GET', $base.'?game=fab'))['member'] ?? []);
    }

    public function testInventoryCatalogPageFiltersAndReportsTotal(): void
    {
        $store = $this->fixtures->store();
        $this->fixtures->inventoryItem($store, $this->fixtures->card(8901, ['name' => 'Swords to Plowshares', 'set' => 'lea', 'color_identity' => ['W']]), 2);
        $this->fixtures->inventoryItem($store, $this->fixtures->card(8902, ['name' => 'Swords to Plowshares', 'set' => 'clb', 'color_identity' => ['W', 'U']]), 1);
        $this->fixtures->inventoryItem($store, $this->fixtures->card(8903, ['name' => 'Lightning Bolt', 'set' => 'lea', 'color_identity' => ['R']]), 4);
        $this->em->flush();

        $base = "/api/stores/{$store->getSlug()}/inventory";
        $page = $this->jsonRequest('GET', $base.'?q=Swords&page=1&itemsPerPage=1&inStockOnly=1');
        $items = $page['member'] ?? $page['hydra:member'] ?? [];
        $total = $page['totalItems'] ?? $page['hydra:totalItems'] ?? null;

        self::assertCount(1, $items);
        self::assertSame(2, $total);
        self::assertSame('Swords to Plowshares', $items[0]['card']['name']);

        $page2 = $this->jsonRequest('GET', $base.'?q=Swords&page=2&itemsPerPage=1&inStockOnly=1');
        $items2 = $page2['member'] ?? $page2['hydra:member'] ?? [];
        self::assertCount(1, $items2);
        self::assertSame('Swords to Plowshares', $items2[0]['card']['name']);
        self::assertNotSame($items[0]['id'], $items2[0]['id']);

        $white = $this->jsonRequest('GET', $base.'?q=Swords&colors=W&page=1&itemsPerPage=24&inStockOnly=1');
        $whiteItems = $white['member'] ?? $white['hydra:member'] ?? [];
        self::assertCount(1, $whiteItems);
        self::assertSame('lea', $whiteItems[0]['card']['setCode']);
        self::assertSame(1, $white['totalItems'] ?? $white['hydra:totalItems']);

        // The storefront sends Accept: application/json. Without an envelope,
        // API Platform serializes the paginator as a 24-item array and the UI
        // thinks that is the whole catalog.
        $this->client->request('GET', $base.'?q=Swords&page=1&itemsPerPage=1&inStockOnly=1', server: [
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
        ]);
        $json = json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
        self::assertIsArray($json['member'] ?? null);
        self::assertCount(1, $json['member']);
        self::assertSame(2, $json['totalItems'] ?? null);
        self::assertNotTrue(array_is_list($json), 'json catalog pages must not be a bare item array');
    }

    public function testStoreGamesListsOnlyWhatTheStoreCarries(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(8810);
        $card->setGame($this->game('pokemon'));
        $this->fixtures->inventoryItem($store, $card, 1);

        $product = new SealedProduct();
        $product->setGame($this->game('fab'));
        $product->setTcgcsvProductId(880001);
        $product->setName('Rosetta Booster Box');
        $this->em->persist($product);
        $this->em->flush();

        $this->authenticate($store->getOwner());
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory");
        $this->client->request(
            'POST',
            "/api/stores/{$store->getSlug()}/sealed-inventory",
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
            content: json_encode(['sealedProductId' => $product->getId(), 'quantity' => 2]),
        );
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $this->authenticate(null);
        $games = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games");

        $byCode = array_column($games, null, 'code');
        self::assertArrayHasKey('pokemon', $byCode, 'a game with singles is listed');
        self::assertArrayHasKey('fab', $byCode, 'a game with only sealed is listed too');
        self::assertArrayNotHasKey('riftbound', $byCode, 'games the store does not carry are omitted');

        self::assertTrue($byCode['pokemon']['hasSingles']);
        self::assertFalse($byCode['pokemon']['hasSealed']);
        self::assertTrue($byCode['fab']['hasSealed']);
        self::assertFalse($byCode['fab']['hasSingles']);
    }

    public function testCatalogSearchIsScopedAndSkipsScryfallForOtherGames(): void
    {
        $store = $this->fixtures->store();

        $mtgCard = $this->fixtures->card(8820, ['name' => 'Shared Name Card']);
        $opCard = $this->fixtures->card(8821, ['name' => 'Shared Name Card']);
        $opCard->setGame($this->game('onepiece'));
        $this->em->flush();

        $this->authenticate($store->getOwner());

        // Scoped to One Piece: only the One Piece printing, resolved locally.
        $results = $this->jsonRequest('GET', '/api/catalog/search?q=Shared+Name&game=onepiece');
        self::assertCount(1, $results);
        self::assertSame((string) $opCard->getId(), $results[0]['id']);
        self::assertSame('onepiece', $results[0]['game']);

        // Scoped to Magic: the legacy card only.
        $mtgResults = $this->jsonRequest('GET', '/api/catalog/search?q=Shared+Name&game=mtg');
        self::assertSame([(string) $mtgCard->getId()], array_column($mtgResults, 'id'));

        $this->jsonRequest('GET', '/api/catalog/search?q=Shared+Name&game=not-a-game');
        self::assertSame(404, $this->client->getResponse()->getStatusCode());
    }

    public function testPerGameCsvTemplatesAreDownloadable(): void
    {
        // Public: a store owner grabs these before their first import.
        $this->client->request('GET', '/api/catalog/games/onepiece/import-template');
        $response = $this->client->getResponse();
        self::assertSame(200, $response->getStatusCode());
        self::assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        self::assertStringContainsString(
            'onepiece-singles-inventory-template.csv',
            (string) $response->headers->get('Content-Disposition'),
        );

        $csv = (string) $response->getContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));
        self::assertStringContainsString('collectorNumber', $lines[0], 'headers match what the parser reads');
        self::assertStringContainsString('OP01-003', $csv, "examples use the game's own numbering");
        self::assertGreaterThanOrEqual(3, count($lines), 'header plus example rows');

        // Sealed template for the same game is a different sheet.
        $this->client->request('GET', '/api/catalog/games/mtg/import-template?type=sealed');
        $sealed = (string) $this->client->getResponse()->getContent();
        self::assertStringContainsString('productId', $sealed);
        self::assertStringContainsString('Modern Horizons 3 Play Booster Box', $sealed);
        self::assertStringContainsString(
            'mtg-sealed-inventory-template.csv',
            (string) $this->client->getResponse()->headers->get('Content-Disposition'),
        );

        $this->client->request('GET', '/api/catalog/games/nope/import-template');
        self::assertSame(404, $this->client->getResponse()->getStatusCode());
    }
}
