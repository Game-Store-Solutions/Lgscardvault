<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Service\Store\StoreFeatureCatalog;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreSettingsFeaturesTest extends WebTestCase
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
        $this->store = $this->fixtures->store('feature-flags-store');
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

    private function getStore(string $slug): array
    {
        $this->client->request(
            'GET',
            sprintf('/api/stores/%s', $slug),
            server: ['HTTP_ACCEPT' => 'application/json'],
        );

        return json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testDefaultsAreListedAndFeaturesOn(): void
    {
        $read = $this->getStore($this->store->getSlug());
        self::assertTrue($read['isListed']);
        self::assertSame(StoreFeatureCatalog::defaults(), $read['features']);
    }

    public function testUnlistedStoreDropsOutOfMarketplace(): void
    {
        $visible = $this->fixtures->store('listed-neighbor-store');

        $patch = $this->patchSettings(['isListed' => false]);
        self::assertResponseIsSuccessful();
        self::assertFalse($patch['isListed']);

        $read = $this->getStore($this->store->getSlug());
        self::assertFalse($read['isListed']);

        $this->client->request('GET', '/api/stores', server: ['HTTP_ACCEPT' => 'application/json']);
        self::assertResponseIsSuccessful();
        $list = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        $members = $list['member'] ?? $list['hydra:member'] ?? $list;
        $slugs = array_column(is_array($members) ? $members : [], 'slug');

        self::assertContains($visible->getSlug(), $slugs);
        self::assertNotContains($this->store->getSlug(), $slugs);
    }

    public function testFeaturePatchMergesAndRejectsUnknownKeys(): void
    {
        $patch = $this->patchSettings(['features' => ['events' => false, 'sellTrade' => false]]);
        self::assertResponseIsSuccessful();
        self::assertFalse($patch['features']['events']);
        self::assertFalse($patch['features']['sellTrade']);
        self::assertTrue($patch['features']['sealed']);

        $again = $this->patchSettings(['features' => ['events' => true]]);
        self::assertResponseIsSuccessful();
        self::assertTrue($again['features']['events']);
        self::assertFalse($again['features']['sellTrade']);

        $this->patchSettings(['features' => ['notAFeature' => false]]);
        self::assertResponseStatusCodeSame(422);

        $this->patchSettings(['isListed' => 'no']);
        self::assertResponseStatusCodeSame(422);
    }
}
