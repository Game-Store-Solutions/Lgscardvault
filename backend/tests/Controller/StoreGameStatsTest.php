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
 * Per-game inventory statistics for the admin workspace.
 *
 * These replace the count that used to sit on the navigation pill, which
 * could not say whether it meant singles or sealed, listings or copies.
 * Each game reports its own numbers, and one game's stock must never
 * appear in another's totals.
 */
final class StoreGameStatsTest extends WebTestCase
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

    private function game(string $code): Game
    {
        $game = $this->em->getRepository(Game::class)->findOneBy(['code' => $code]);
        self::assertNotNull($game);

        return $game;
    }

    public function testStatsAreCountedPerGameAndNeverPooled(): void
    {
        $store = $this->fixtures->store();

        // Magic: a legacy listing (no game row) plus a game-tagged one.
        $legacy = $this->fixtures->card(9501, ['name' => 'Legacy Bolt']);
        $this->fixtures->inventoryItem($store, $legacy, 4);
        $taggedMtg = $this->fixtures->card(9502, ['name' => 'Tagged Magic Card']);
        $taggedMtg->setGame($this->game('mtg'));
        $this->fixtures->inventoryItem($store, $taggedMtg, 2);

        // One Piece: one singles listing of 3 copies.
        $op = $this->fixtures->card(9503, ['name' => 'Monkey.D.Luffy']);
        $op->setGame($this->game('onepiece'));
        $this->fixtures->inventoryItem($store, $op, 3);
        $this->em->flush();

        // One Piece sealed: one product, 5 units.
        $product = new SealedProduct();
        $product->setGame($this->game('onepiece'));
        $product->setTcgcsvProductId(950001);
        $product->setName('Romance Dawn Booster Box');
        $this->em->persist($product);
        $this->em->flush();

        $this->authenticate($store->getOwner());
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", [
            'sealedProductId' => $product->getId(),
            'quantity' => 5,
            'priceCents' => 8999,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        // Magic sees only Magic — including the legacy NULL-game listing.
        $mtg = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games/mtg/stats");
        self::assertSame(2, $mtg['singles']['listings']);
        self::assertSame(6, $mtg['singles']['copies']);
        self::assertSame(0, $mtg['sealed']['products'], 'One Piece sealed must not count toward Magic');
        self::assertSame(2, $mtg['total']['listings']);
        self::assertSame(6, $mtg['total']['copies']);

        // One Piece sees its singles AND its sealed, and nothing of Magic's.
        $onepiece = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games/onepiece/stats");
        self::assertSame(1, $onepiece['singles']['listings']);
        self::assertSame(3, $onepiece['singles']['copies']);
        self::assertSame(1, $onepiece['sealed']['products']);
        self::assertSame(5, $onepiece['sealed']['units']);
        self::assertSame(2, $onepiece['total']['listings'], 'singles listings + sealed products');
        self::assertSame(8, $onepiece['total']['copies'], 'copies + units');

        // A game this store does not carry reports honest zeroes.
        $fab = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games/fab/stats");
        self::assertSame(0, $fab['total']['listings']);
        self::assertSame(0, $fab['total']['copies']);
        self::assertSame('Flesh and Blood', $fab['gameName']);
    }

    public function testStatsRequireStoreManagement(): void
    {
        $store = $this->fixtures->store();

        $this->authenticate(null);
        $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games/mtg/stats");
        self::assertSame(401, $this->client->getResponse()->getStatusCode());

        $this->authenticate($this->fixtures->user());
        $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games/mtg/stats");
        self::assertSame(403, $this->client->getResponse()->getStatusCode(), 'inventory numbers are staff-only');

        $this->authenticate($store->getOwner());
        $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/games/nope/stats");
        self::assertSame(404, $this->client->getResponse()->getStatusCode());
    }
}
