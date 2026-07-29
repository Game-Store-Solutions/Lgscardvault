<?php

namespace App\Tests\Controller;

use App\Entity\Card;
use App\Entity\Game;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * The catalog's finish filter used to compare the literal string "foil"
 * against a card's treatments. No Pokemon card is called "foil" — it is
 * "Holofoil" — so filtering a Pokemon catalog to foils returned nothing at
 * all. The filter asks about the treatment, not the word.
 */
final class FinishFilterSearchTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private object $client;
    private string $bearer;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        // Catalog search is for signed-in users; any account will do.
        $this->bearer = $c->get(JWTTokenManagerInterface::class)
            ->create((new CatalogFixtures($this->em))->user());
    }

    /** @param list<string> $finishes */
    private function pokemonCard(string $name, string $collectorNumber, array $finishes): Card
    {
        $card = new Card(Uuid::v4());
        $card->setOracleId(Uuid::v4());
        $card->setGame($this->em->getRepository(Game::class)->findOneBy(['code' => 'pokemon']));
        $card->setName($name);
        $card->setSetCode('obf');
        $card->setSetName('Obsidian Flames');
        $card->setCollectorNumber($collectorNumber);
        $card->setFinishes($finishes);
        $this->em->persist($card);
        $this->em->flush();

        return $card;
    }

    /** @return list<string> */
    private function search(string $query, string $finish): array
    {
        $this->client->request(
            'GET',
            '/api/catalog/search?'.http_build_query([
                'q' => $query,
                'game' => 'pokemon',
                'finish' => $finish,
            ]),
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
        );
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $results = json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];

        return array_column($results, 'name');
    }

    public function testHolofoilPrintingsAnswerToTheFoilFilter(): void
    {
        $this->pokemonCard('Charizard Holo Only', '125', ['Holofoil', 'Reverse Holofoil']);
        $this->pokemonCard('Pikachu Plain Only', '173', ['Normal']);

        $foils = $this->search('Charizard Holo Only', 'foil');
        self::assertContains('Charizard Holo Only', $foils, 'Holofoil is a foil treatment');

        self::assertNotContains(
            'Charizard Holo Only',
            $this->search('Charizard Holo Only', 'nonfoil'),
            'a holo-only printing has no plain version to sell',
        );

        self::assertContains('Pikachu Plain Only', $this->search('Pikachu Plain Only', 'nonfoil'));
        self::assertNotContains('Pikachu Plain Only', $this->search('Pikachu Plain Only', 'foil'));
    }

    public function testACardWithNoRecordedTreatmentsIsStillFindable(): void
    {
        // Unpriced cards carry no subtypes; hiding them behind the filter is
        // how a freshly synced game looks empty.
        $this->pokemonCard('Unpriced Snorlax', '999', []);

        self::assertContains('Unpriced Snorlax', $this->search('Unpriced Snorlax', 'foil'));
    }
}
