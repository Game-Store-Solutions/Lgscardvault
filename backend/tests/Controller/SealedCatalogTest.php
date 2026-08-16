<?php

namespace App\Tests\Controller;

use App\Entity\SealedProduct;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Multi-game catalog + store sealed inventory over HTTP: public game/set/
 * sealed browsing, staff CRUD on sealed lines, storefront reads showing
 * only in-stock lines, and platform-admin gating on sync endpoints.
 */
final class SealedCatalogTest extends WebTestCase
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

    private function sealedProduct(string $gameCode, string $name, ?int $marketCents = 10000): SealedProduct
    {
        static $productId = 900000;
        // Resolve through the test's own EM: the client reboots the kernel per
        // request, so container repositories may sit on a different manager.
        $game = $this->em->getRepository(\App\Entity\Game::class)->findOneBy(['code' => $gameCode]);
        self::assertNotNull($game);

        $product = new SealedProduct();
        $product->setGame($game);
        $product->setTcgcsvProductId(++$productId);
        $product->setName($name);
        $product->setMarketPriceCents($marketCents);
        $this->em->persist($product);
        $this->em->flush();

        return $product;
    }

    public function testPublicCatalogEndpoints(): void
    {
        $games = $this->jsonRequest('GET', '/api/catalog/games');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $codes = array_column($games, 'code');
        foreach (['mtg', 'pokemon', 'onepiece', 'fab', 'riftbound'] as $expected) {
            self::assertContains($expected, $codes);
        }

        self::assertSame([], $this->jsonRequest('GET', '/api/catalog/games/onepiece/sets'));
        $this->jsonRequest('GET', '/api/catalog/games/nope/sets');
        self::assertSame(404, $this->client->getResponse()->getStatusCode());

        // Sealed search: game filter + name query + pagination shape.
        $this->sealedProduct('onepiece', 'Romance Dawn Booster Box');
        $this->sealedProduct('fab', 'Rosetta Booster Box');
        $result = $this->jsonRequest('GET', '/api/catalog/sealed?game=onepiece&q=romance');
        self::assertSame(1, $result['total']);
        self::assertSame('Romance Dawn Booster Box', $result['items'][0]['name']);
        self::assertSame('onepiece', $result['items'][0]['gameCode']);
    }

    public function testSealedInventoryLifecycle(): void
    {
        $store = $this->fixtures->store();
        $product = $this->sealedProduct('onepiece', 'Romance Dawn Booster Box', 8999);
        $other = $this->sealedProduct('fab', 'Rosetta Blitz Deck', 1499);

        // Staff-only: anonymous and stranger writes are rejected.
        $this->authenticate(null);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", ['sealedProductId' => $product->getId(), 'quantity' => 1]);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());
        $this->authenticate($this->fixtures->user());
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", ['sealedProductId' => $product->getId(), 'quantity' => 1]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        // Owner adds stock; missing price falls back to the market snapshot.
        $this->authenticate($store->getOwner());
        $line = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", [
            'sealedProductId' => $product->getId(),
            'quantity' => 3,
            'acquisitionCostCents' => 6500,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(3, $line['quantity']);
        self::assertSame(8999, $line['priceCents'], 'defaults to TCGplayer market price');
        self::assertSame(6500, $line['acquisitionCostCents']);

        // Same product adds fold into the line; explicit price wins.
        $line = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", [
            'sealedProductId' => $product->getId(),
            'quantity' => 2,
            'priceCents' => 9499,
        ]);
        self::assertSame(5, $line['quantity']);
        self::assertSame(9499, $line['priceCents']);

        // A second, out-of-stock line to prove public filtering.
        $soldOut = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", [
            'sealedProductId' => $other->getId(), 'quantity' => 1,
        ]);
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sealed-inventory/{$soldOut['id']}", ['quantity' => 0]);

        // Staff list shows both lines; game filter narrows.
        $all = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory");
        self::assertCount(2, $all);
        $onlyOp = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory?game=onepiece");
        self::assertCount(1, $onlyOp);

        // Public storefront + spotlight expose only in-stock lines, no auth.
        $this->authenticate(null);
        $public = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed");
        self::assertCount(1, $public);
        self::assertSame('Romance Dawn Booster Box', $public[0]['product']['name']);
        $spotlight = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed/spotlight");
        self::assertSame(1, $spotlight['total'] ?? null);
        self::assertCount(1, $spotlight['items'] ?? []);

        // Delete removes the line.
        $this->authenticate($store->getOwner());
        $this->jsonRequest('DELETE', "/api/stores/{$store->getSlug()}/sealed-inventory/{$soldOut['id']}");
        self::assertSame(204, $this->client->getResponse()->getStatusCode());
        self::assertCount(1, $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory"));
    }

    public function testSyncEndpointsRequirePlatformAdmin(): void
    {
        $store = $this->fixtures->store();

        $this->authenticate($store->getOwner());
        $this->jsonRequest('GET', '/api/admin/catalog/sync-runs');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
        $this->jsonRequest('POST', '/api/admin/catalog/sync/onepiece');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $this->authenticate($admin);
        self::assertSame([], $this->jsonRequest('GET', '/api/admin/catalog/sync-runs'));
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $queued = $this->jsonRequest('POST', '/api/admin/catalog/sync/onepiece');
        self::assertSame(202, $this->client->getResponse()->getStatusCode());
        self::assertSame('queued', $queued['status']);

        $this->jsonRequest('POST', '/api/admin/catalog/sync/not-a-game');
        self::assertSame(404, $this->client->getResponse()->getStatusCode());

        $games = $this->jsonRequest('GET', '/api/admin/catalog/games');
        self::assertGreaterThanOrEqual(5, count($games));
    }
}
