<?php

namespace App\Tests\Controller;

use App\Tests\Support\CatalogFixtures;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class CatalogArtistBrowseTest extends WebTestCase
{
    private object $client;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->fixtures = new CatalogFixtures(static::getContainer()->get('doctrine')->getManager());
        $this->client->loginUser($this->fixtures->user(['ROLE_USER']));
    }

    public function testByArtistReturnsMatchingPrintings(): void
    {
        $a = $this->fixtures->card(8801, ['name' => 'Artist Card A', 'set' => 'blb', 'collector_number' => '1']);
        $a->setArtist('Issei Murakami');
        $b = $this->fixtures->card(8802, ['name' => 'Artist Card B', 'set' => 'blb', 'collector_number' => '2']);
        $b->setArtist('Issei Murakami');
        $other = $this->fixtures->card(8803, ['name' => 'Other', 'set' => 'blb', 'collector_number' => '3']);
        $other->setArtist('Someone Else');
        static::getContainer()->get('doctrine')->getManager()->flush();

        $this->client->request('GET', '/api/catalog/by-artist?'.http_build_query([
            'artist' => 'Issei Murakami',
            'game' => 'mtg',
        ]));
        self::assertResponseIsSuccessful();
        $payload = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame(2, $payload['total']);
        self::assertCount(2, $payload['items']);
        $names = array_column($payload['items'], 'name');
        self::assertContains('Artist Card A', $names);
        self::assertContains('Artist Card B', $names);
    }

    public function testByArtistMatchesFaceOnlyCredits(): void
    {
        $this->fixtures->card(8810, [
            'name' => 'Transforming Horror',
            'set' => 'mid',
            'collector_number' => '10',
            'artist' => 'Someone Else',
            'card_faces' => [
                ['name' => 'Front', 'artist' => 'Chris Rahn'],
                ['name' => 'Back', 'artist' => 'Chris Rahn'],
            ],
        ]);
        $this->fixtures->card(8811, [
            'name' => 'Unrelated',
            'set' => 'mid',
            'collector_number' => '11',
            'artist' => 'John Avon',
        ]);

        $this->client->request('GET', '/api/catalog/by-artist?'.http_build_query([
            'artist' => 'chris rahn',
            'game' => 'mtg',
        ]));
        self::assertResponseIsSuccessful();
        $payload = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame(1, $payload['total']);
        self::assertSame('Transforming Horror', $payload['items'][0]['name']);
    }
}
