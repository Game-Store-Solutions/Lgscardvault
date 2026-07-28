<?php

namespace App\Tests\Controller;

use App\Entity\Game;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Adding one card from the admin catalog search.
 *
 * The price the seller types has to be the price that gets listed. It used
 * to be ignored: the writer always derived the price from the card's market
 * data, so a card the catalog has no price for — routine outside Magic —
 * was silently listed at $0.00 however much the seller entered.
 */
final class SingleCardAddTest extends WebTestCase
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

    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $this->client->request($method, $url, server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
        ], content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testSellerPriceIsUsedForACardWithNoMarketPrice(): void
    {
        $store = $this->fixtures->store();

        // A TCGCSV-style One Piece card: real card, no price data at all.
        $card = $this->fixtures->card(9301, ['name' => 'Monkey.D.Luffy']);
        $card->setGame($this->em->getRepository(Game::class)->findOneBy(['code' => 'onepiece']));
        $card->setPrices(null);
        $this->em->flush();

        $this->authenticate($store->getOwner());
        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 2,
            'priceCents' => 1250,
            'condition' => 'NM',
            'isFoil' => false,
            'acquisitionCostCents' => 700,
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(1250, $created['priceCents'], 'the seller-entered price is what gets listed');
        self::assertSame(2, $created['quantity']);
        self::assertSame(700, $created['acquisitionCostCents']);

        // And it reads back the same way the storefront would see it.
        $listing = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=onepiece");
        $items = $listing['member'] ?? $listing;
        self::assertCount(1, $items);
        self::assertSame(1250, $items[0]['priceCents']);
    }

    public function testMarketPriceStillFillsInWhenNoPriceIsGiven(): void
    {
        $store = $this->fixtures->store();
        // Fixture cards carry Scryfall-shaped prices; usd is "1.23".
        $card = $this->fixtures->card(9302);
        $this->em->flush();

        $this->authenticate($store->getOwner());
        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'condition' => 'NM',
            'isFoil' => false,
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertGreaterThan(
            0,
            $created['priceCents'],
            'omitting the price still falls back to the market price',
        );
    }

    public function testAddingAnotherCopyKeepsTheSellerPrice(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(9303, ['name' => 'Trafalgar Law']);
        $card->setGame($this->em->getRepository(Game::class)->findOneBy(['code' => 'onepiece']));
        $card->setPrices(null);
        $this->em->flush();

        $this->authenticate($store->getOwner());
        $body = [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'priceCents' => 899,
            'condition' => 'NM',
            'isFoil' => false,
        ];

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", $body);
        $second = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", array_merge($body, ['priceCents' => 950]));

        self::assertSame(2, $second['quantity'], 'a repeat add folds into the same line');
        self::assertSame(950, $second['priceCents'], 'and re-prices it to the latest entry');
    }
}
