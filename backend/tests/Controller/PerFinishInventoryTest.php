<?php

namespace App\Tests\Controller;

use App\Entity\Game;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Inventory identifies a listing by the treatment's NAME, not a foil flag.
 *
 * A Pokemon card is printed Normal, Holofoil and Reverse Holofoil — three
 * things that trade at three different prices. Under the boolean, the last
 * two were the same row: stocking one overwrote the other's price and summed
 * their quantities into a single meaningless line.
 */
final class PerFinishInventoryTest extends WebTestCase
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

    /** @param list<string> $finishes */
    private function card(int $seed, string $name, string $gameCode, array $finishes): \App\Entity\Card
    {
        $card = $this->fixtures->card($seed, ['name' => $name]);
        if ('mtg' !== $gameCode) {
            $card->setGame($this->em->getRepository(Game::class)->findOneBy(['code' => $gameCode]));
        }
        $card->setFinishes($finishes);
        $this->em->flush();

        return $card;
    }

    public function testTwoFoilTreatmentsAreTwoListings(): void
    {
        $store = $this->fixtures->store();
        $card = $this->card(9601, 'Charizard ex', 'pokemon', ['Normal', 'Holofoil', 'Reverse Holofoil']);
        $this->authenticate($store->getOwner());

        $holo = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 2,
            'priceCents' => 4250,
            'condition' => 'NM',
            'finish' => 'Holofoil',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $reverse = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 3,
            'priceCents' => 1200,
            'condition' => 'NM',
            'finish' => 'Reverse Holofoil',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        self::assertNotSame($holo['id'], $reverse['id'], 'two treatments must not collapse into one line');
        self::assertSame('Holofoil', $holo['finish']);
        self::assertSame('Reverse Holofoil', $reverse['finish']);
        self::assertSame(4250, $holo['priceCents']);
        self::assertSame(1200, $reverse['priceCents'], "the reverse holo's price is its own");

        // Both are foil for anything still working on that axis (shimmer,
        // market price lookup).
        self::assertTrue($holo['isFoil']);
        self::assertTrue($reverse['isFoil']);

        $inventory = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=pokemon");
        $lines = $inventory['member'] ?? $inventory;
        $finishes = array_column($lines, 'finish');
        sort($finishes);
        self::assertSame(['Holofoil', 'Reverse Holofoil'], $finishes);
    }

    public function testRestockingTheSameTreatmentStillMerges(): void
    {
        $store = $this->fixtures->store();
        $card = $this->card(9602, 'Pikachu', 'pokemon', ['Normal', 'Holofoil']);
        $this->authenticate($store->getOwner());

        $body = [
            'cardId' => (string) $card->getId(),
            'quantity' => 2,
            'priceCents' => 500,
            'condition' => 'NM',
            'finish' => 'Holofoil',
        ];
        $first = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", $body);
        $second = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", $body);

        self::assertSame($first['id'], $second['id']);
        self::assertSame(4, $second['quantity'], 'the same treatment is the same line');
    }

    public function testTheOldBooleanIsTranslatedIntoTheGamesOwnWord(): void
    {
        $store = $this->fixtures->store();
        $pokemon = $this->card(9603, 'Snorlax', 'pokemon', ['Normal', 'Holofoil']);
        $magic = $this->card(9604, 'Lightning Bolt', 'mtg', ['nonfoil', 'foil']);
        $this->authenticate($store->getOwner());

        // A client that only knows isFoil — the CSV importer, an older build.
        $poke = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $pokemon->getId(),
            'quantity' => 1,
            'priceCents' => 999,
            'condition' => 'NM',
            'isFoil' => true,
        ]);
        self::assertSame('Holofoil', $poke['finish'], 'a Pokemon card has no printing called "Foil"');

        $mtg = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $magic->getId(),
            'quantity' => 1,
            'priceCents' => 199,
            'condition' => 'NM',
            'isFoil' => true,
        ]);
        self::assertSame('Foil', $mtg['finish']);

        $plain = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $pokemon->getId(),
            'quantity' => 1,
            'priceCents' => 100,
            'condition' => 'NM',
            'isFoil' => false,
        ]);
        self::assertSame('Normal', $plain['finish'], 'Pokemon calls its plain printing "Normal"');
    }

    public function testAListingCanBeMovedBetweenTreatments(): void
    {
        $store = $this->fixtures->store();
        $card = $this->card(9605, 'Mewtwo', 'pokemon', ['Normal', 'Holofoil', 'Reverse Holofoil']);
        $this->authenticate($store->getOwner());

        $line = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'priceCents' => 800,
            'condition' => 'NM',
            'finish' => 'Holofoil',
        ]);

        $moved = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/inventory/{$line['id']}", [
            'quantity' => 1,
            'priceCents' => 800,
            'condition' => 'NM',
            'finish' => 'Reverse Holofoil',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('Reverse Holofoil', $moved['finish']);

        // A PATCH that says nothing about the finish leaves it alone.
        $repriced = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/inventory/{$line['id']}", [
            'quantity' => 1,
            'priceCents' => 950,
            'condition' => 'NM',
        ]);
        self::assertSame('Reverse Holofoil', $repriced['finish']);
        self::assertSame(950, $repriced['priceCents']);
    }

    public function testSpellingVariantsDoNotBecomeSeparateLines(): void
    {
        $store = $this->fixtures->store();
        $card = $this->card(9606, 'Sol Ring', 'mtg', ['nonfoil', 'foil']);
        $this->authenticate($store->getOwner());

        $first = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'priceCents' => 300,
            'condition' => 'NM',
            'finish' => 'non-foil',
        ]);
        $second = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'priceCents' => 300,
            'condition' => 'NM',
            'finish' => 'NONFOIL',
        ]);

        self::assertSame('Nonfoil', $first['finish']);
        self::assertSame($first['id'], $second['id'], 'one treatment, however it is spelled');
    }
}
