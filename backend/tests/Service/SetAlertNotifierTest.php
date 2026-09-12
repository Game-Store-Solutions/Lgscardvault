<?php

namespace App\Tests\Service;

use App\Entity\CustomerNotification;
use App\Entity\Game;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Set watches notify on any stock-in. One unread wave per store+set;
 * later cards bump the count. A new wave starts only after that notice is read.
 */
final class SetAlertNotifierTest extends WebTestCase
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

    public function testUnreadWaveBumpsCountThenStartsAgainAfterRead(): void
    {
        $store = $this->fixtures->store();
        $first = $this->fixtures->card(1901);
        $second = $this->fixtures->card(1902);
        $third = $this->fixtures->card(1903);
        $shopper = $this->fixtures->user();

        $this->authenticate($shopper);
        $created = $this->jsonRequest('POST', '/api/me/set-alerts', [
            'store' => $store->getSlug(),
            'game' => Game::CODE_MTG,
            'setCode' => $first->getSetCode(),
        ]);
        self::assertContains($this->client->getResponse()->getStatusCode(), [200, 201]);
        self::assertNotEmpty($created['id'] ?? null);

        $this->authenticate($store->getOwner());
        $this->stock($store->getSlug(), $first);
        $this->em->clear();

        $notices = $this->notices($shopper);
        self::assertCount(1, $notices);
        self::assertSame(CustomerNotification::TYPE_SET_RESTOCK, $notices[0]->getType());
        self::assertStringStartsWith('1 card', $notices[0]->getBody());

        $this->stock($store->getSlug(), $second);
        $this->em->clear();

        $notices = $this->notices($shopper);
        self::assertCount(1, $notices, 'unread waves reuse one notice');
        self::assertStringStartsWith('2 cards', $notices[0]->getBody());

        $this->authenticate($shopper);
        $this->jsonRequest('PATCH', '/api/me/notifications/'.$notices[0]->getId().'/read');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $this->authenticate($store->getOwner());
        $this->stock($store->getSlug(), $third);
        $this->em->clear();

        $notices = $this->notices($shopper);
        self::assertCount(2, $notices, 'a new wave starts after the last notice was read');
        usort($notices, static fn (CustomerNotification $a, CustomerNotification $b): int => $a->getId() <=> $b->getId());
        self::assertStringStartsWith('1 card', $notices[1]->getBody());
    }

    private function stock(string $slug, \App\Entity\Card $card): void
    {
        $this->jsonRequest('POST', "/api/stores/{$slug}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'priceCents' => 500,
            'condition' => 'NM',
            'isFoil' => false,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
    }

    /** @return list<CustomerNotification> */
    private function notices(User $shopper): array
    {
        return $this->em->getRepository(CustomerNotification::class)->findBy([
            'user' => $shopper,
            'type' => CustomerNotification::TYPE_SET_RESTOCK,
        ]);
    }
}
