<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreSettingsCommunityEventsTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private Store $store;
    private string $bearer;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->store = $this->fixtures->store('community-events-store');
        $this->bearer = $c->get(JWTTokenManagerInterface::class)->create($this->store->getOwner());
    }

    /** @param array<string, mixed> $body */
    private function patchSettings(array $body): array
    {
        $this->client->request(
            'PATCH',
            sprintf('/api/stores/%s/settings', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode($body),
        );

        return json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    private function readStore(): array
    {
        $this->client->request(
            'GET',
            sprintf('/api/stores/%s', $this->store->getSlug()),
            server: ['HTTP_ACCEPT' => 'application/json'],
        );
        self::assertResponseIsSuccessful();

        return json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testCommunityEventImagePersistsOnPublicStoreRead(): void
    {
        $startsAt = (new \DateTimeImmutable('+2 days'))->format(\DateTimeInterface::ATOM);
        $patch = $this->patchSettings([
            'heroLayout' => 'event-board',
            'communityEvents' => [
                'boardHeading' => 'Community board',
                'items' => [
                    [
                        'id' => 'fnm-1',
                        'title' => 'Friday Night Magic',
                        'startsAt' => $startsAt,
                        'location' => 'Main play area',
                        'imageUrl' => '/uploads/fnm-poster.png',
                        'pinned' => true,
                    ],
                ],
            ],
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame('event-board', $patch['heroLayout']);
        self::assertSame('/uploads/fnm-poster.png', $patch['communityEvents']['items'][0]['imageUrl'] ?? null);

        $read = $this->readStore();
        self::assertSame('event-board', $read['heroLayout']);
        self::assertSame('Friday Night Magic', $read['communityEvents']['items'][0]['title'] ?? null);
        self::assertSame('/uploads/fnm-poster.png', $read['communityEvents']['items'][0]['imageUrl'] ?? null);
    }

    public function testRejectsInvalidEventImageUrl(): void
    {
        $this->patchSettings([
            'communityEvents' => [
                'items' => [
                    [
                        'id' => 'bad-img',
                        'title' => 'Bad poster',
                        'startsAt' => (new \DateTimeImmutable('+1 day'))->format(\DateTimeInterface::ATOM),
                        'imageUrl' => 'javascript:alert(1)',
                    ],
                ],
            ],
        ]);
        self::assertResponseStatusCodeSame(422);
    }
}
