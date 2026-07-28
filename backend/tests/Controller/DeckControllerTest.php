<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Saved decks: user-owned lists created from pasted decklists, line
 * editing, and strict per-user isolation.
 */
final class DeckControllerTest extends WebTestCase
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
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer];
        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testDeckLifecycleWithDecklistImport(): void
    {
        $known = $this->fixtures->card(980);
        $user = $this->fixtures->user(['ROLE_USER']);
        $stranger = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();

        // Create from a pasted list: known names link to the catalog, unknown
        // names are kept as text, duplicates merge, comments are skipped.
        $this->authenticate($user);
        $deck = $this->jsonRequest('POST', '/api/me/decks', [
            'name' => 'Mono Test',
            'format' => 'Commander',
            'list' => "# lands later\n2x {$known->getName()}\n{$known->getName()}\nSome Unknown Card (ABC) 42\n",
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(4, $deck['cardCount']);
        self::assertCount(2, $deck['cards']);
        $byName = array_column($deck['cards'], null, 'cardName');
        self::assertSame(3, $byName[$known->getName()]['quantity']);
        self::assertNotNull($byName[$known->getName()]['cardId']);
        self::assertNull($byName['Some Unknown Card']['cardId'], 'unresolved names stay as text');

        // Line ops: bump a quantity, remove a line, add one back by name.
        $lineId = $byName[$known->getName()]['id'];
        $updated = $this->jsonRequest('PATCH', "/api/me/decks/{$deck['id']}/cards/{$lineId}", ['quantity' => 4]);
        self::assertSame(5, $updated['cardCount']);
        $removed = $this->jsonRequest('DELETE', "/api/me/decks/{$deck['id']}/cards/{$byName['Some Unknown Card']['id']}");
        self::assertCount(1, $removed['cards']);
        $added = $this->jsonRequest('POST', "/api/me/decks/{$deck['id']}/cards", ['name' => $known->getName(), 'quantity' => 1]);
        self::assertSame(5, array_column($added['cards'], null, 'cardName')[$known->getName()]['quantity'], 'same-name adds merge');

        // Rename + list view.
        $this->jsonRequest('PATCH', "/api/me/decks/{$deck['id']}", ['name' => 'Renamed']);
        $list = $this->jsonRequest('GET', '/api/me/decks');
        self::assertSame('Renamed', $list[0]['name']);

        // Another user can neither see nor edit the deck.
        $this->authenticate($stranger);
        $this->jsonRequest('GET', "/api/me/decks/{$deck['id']}");
        self::assertSame(404, $this->client->getResponse()->getStatusCode());
        self::assertCount(0, $this->jsonRequest('GET', '/api/me/decks'));

        // Delete.
        $this->authenticate($user);
        $this->jsonRequest('DELETE', "/api/me/decks/{$deck['id']}");
        self::assertSame(204, $this->client->getResponse()->getStatusCode());
        self::assertCount(0, $this->jsonRequest('GET', '/api/me/decks'));
    }
}
