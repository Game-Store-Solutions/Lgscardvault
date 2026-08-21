<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/** The five curated hero layouts persist via settings PATCH and appear on public store read. */
final class StoreSettingsHeroLayoutTest extends WebTestCase
{
    private const LAYOUTS = [
        'cinematic',
        'living-inventory',
        'trading-table',
        'event-board',
        'floating-cards',
    ];

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
        $this->store = $this->fixtures->store('hero-layout-store');
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
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    private function readStore(): array
    {
        $this->client->request('GET', sprintf('/api/stores/%s', $this->store->getSlug()));
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testEachHeroLayoutPersistsAndIsExposedOnStoreRead(): void
    {
        foreach (self::LAYOUTS as $layout) {
            $patch = $this->patchSettings(['heroLayout' => $layout]);
            self::assertSame($layout, $patch['heroLayout'] ?? null, "PATCH response for {$layout}");

            $read = $this->readStore();
            self::assertSame($layout, $read['heroLayout'] ?? null, "GET store read for {$layout}");
        }
    }

    public function testLegacyFloatingCollectionNormalizesToFloatingCards(): void
    {
        $patch = $this->patchSettings(['heroLayout' => 'floating-collection']);
        self::assertSame('floating-cards', $patch['heroLayout']);
    }

    public function testHeroCopyFieldsPersist(): void
    {
        $payload = [
            'tagline' => 'QA tagline',
            'heroHeading' => 'QA heading',
            'heroSubheading' => 'QA subheading',
            'heroImageUrl' => '/uploads/hero-qa.jpg',
            'logoUrl' => '/uploads/logo-qa.png',
            'heroLayout' => 'cinematic',
        ];

        $this->patchSettings($payload);
        $read = $this->readStore();

        self::assertSame('QA tagline', $read['tagline']);
        self::assertSame('QA heading', $read['heroHeading']);
        self::assertSame('cinematic', $read['heroLayout']);
    }

    public function testHeroImageOpacityPersistsForLightAndDark(): void
    {
        $patch = $this->patchSettings([
            'heroImageOpacity' => 62,
            'darkHeroImageOpacity' => 35,
        ]);
        self::assertSame(62, $patch['heroImageOpacity']);
        self::assertSame(35, $patch['darkHeroImageOpacity']);

        $read = $this->readStore();
        self::assertSame(62, $read['heroImageOpacity']);
        self::assertSame(35, $read['darkHeroImageOpacity']);
    }

    public function testHeroImageOpacityRejectsOutOfRange(): void
    {
        $this->client->request(
            'PATCH',
            sprintf('/api/stores/%s/settings', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode(['heroImageOpacity' => 140]),
        );
        self::assertResponseStatusCodeSame(422);
    }

    public function testDarkHeroImageOpacityCanInheritLight(): void
    {
        $this->patchSettings(['heroImageOpacity' => 80, 'darkHeroImageOpacity' => 20]);
        $patch = $this->patchSettings(['darkHeroImageOpacity' => null]);
        self::assertNull($patch['darkHeroImageOpacity']);
    }

    public function testDarkHeroImageUrlAndPositionPersist(): void
    {
        $patch = $this->patchSettings([
            'heroImageUrl' => '/uploads/hero-light.jpg',
            'darkHeroImageUrl' => '/uploads/hero-dark.jpg',
            'heroImagePosition' => 20,
            'heroImagePositionX' => 15,
            'darkHeroImagePosition' => 80,
            'darkHeroImagePositionX' => 70,
            'heroImagePositionMobileX' => 35,
            'heroImagePositionMobileY' => 40,
        ]);
        self::assertSame('/uploads/hero-light.jpg', $patch['heroImageUrl']);
        self::assertSame('/uploads/hero-dark.jpg', $patch['darkHeroImageUrl']);
        self::assertSame(20, $patch['heroImagePosition']);
        self::assertSame(15, $patch['heroImagePositionX']);
        self::assertSame(80, $patch['darkHeroImagePosition']);
        self::assertSame(70, $patch['darkHeroImagePositionX']);
        self::assertSame(35, $patch['heroImagePositionMobileX']);
        self::assertSame(40, $patch['heroImagePositionMobileY']);

        $read = $this->readStore();
        self::assertSame('/uploads/hero-dark.jpg', $read['darkHeroImageUrl']);
        self::assertSame(20, $read['heroImagePosition']);
        self::assertSame(15, $read['heroImagePositionX']);
        self::assertSame(80, $read['darkHeroImagePosition']);
        self::assertSame(70, $read['darkHeroImagePositionX']);
        self::assertSame(35, $read['heroImagePositionMobileX']);
        self::assertSame(40, $read['heroImagePositionMobileY']);
    }

    public function testHeroImagePositionRejectsOutOfRange(): void
    {
        $this->client->request(
            'PATCH',
            sprintf('/api/stores/%s/settings', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode(['heroImagePosition' => 140]),
        );
        self::assertResponseStatusCodeSame(422);
    }
}
