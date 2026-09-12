<?php

namespace App\Tests\Service;

use App\Entity\CustomerWantListEntry;
use App\Entity\Game;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/** Pasted names resolve against the catalog and land on the selected store. */
final class WantListBulkAdderTest extends WebTestCase
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

    /** @param array<string, mixed>|null $body */
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

    public function testResolvesCatalogNamesAndReportsUnknown(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(1801);
        $shopper = $this->fixtures->user();

        $this->authenticate($shopper);
        $payload = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/want-list/bulk", [
            'game' => Game::CODE_MTG,
            'lines' => [
                ['name' => $card->getName(), 'quantity' => 2],
                ['name' => 'Definitely Not A Real Card Zzqx', 'quantity' => 1],
            ],
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(1, $payload['added']);
        self::assertSame(0, $payload['skipped']);
        self::assertCount(1, $payload['unresolved']);
        self::assertSame('Definitely Not A Real Card Zzqx', $payload['unresolved'][0]['name']);

        $this->em->clear();
        $entries = $this->em->getRepository(CustomerWantListEntry::class)->findAll();
        self::assertCount(1, $entries);
        self::assertSame($card->getId()->toRfc4122(), $entries[0]->getCard()?->getId()->toRfc4122());
        self::assertSame(2, $entries[0]->getQuantity());
    }
}
