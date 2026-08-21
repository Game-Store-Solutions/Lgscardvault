<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreSettingsSurfaceStyleTest extends WebTestCase
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
        $this->store = $this->fixtures->store('surface-style-store');
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

        return json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testBorderThicknessAndSurfaceBlurPersist(): void
    {
        $patch = $this->patchSettings(['borderThickness' => 3, 'surfaceBlur' => 24, 'borderGlow' => 16]);
        self::assertResponseIsSuccessful();
        self::assertSame(3, $patch['borderThickness']);
        self::assertSame(24, $patch['surfaceBlur']);
        self::assertSame(16, $patch['borderGlow']);

        $this->client->request('GET', sprintf('/api/stores/%s', $this->store->getSlug()));
        self::assertResponseIsSuccessful();
        $read = json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(3, $read['borderThickness']);
        self::assertSame(24, $read['surfaceBlur']);
        self::assertSame(16, $read['borderGlow']);
    }

    public function testSurfaceStyleRejectsOutOfRange(): void
    {
        $this->patchSettings(['borderThickness' => 99]);
        self::assertResponseStatusCodeSame(422);

        $this->patchSettings(['surfaceBlur' => -1]);
        self::assertResponseStatusCodeSame(422);

        $this->patchSettings(['borderGlow' => 80]);
        self::assertResponseStatusCodeSame(422);
    }

    public function testIndependentFrameStylesPersist(): void
    {
        $styles = [
            'hero' => ['borderThickness' => 2, 'borderGlow' => 18, 'surfaceBlur' => 8],
            'tile' => ['borderThickness' => 1, 'borderGlow' => 0, 'surfaceBlur' => 0],
            'card' => ['borderThickness' => 4, 'borderGlow' => 10, 'surfaceBlur' => 16],
        ];
        $patch = $this->patchSettings(['frameStyles' => $styles]);
        self::assertResponseIsSuccessful();
        self::assertSame($styles['hero'], $patch['frameStyles']['hero']);
        self::assertSame($styles['tile'], $patch['frameStyles']['tile']);
        self::assertSame($styles['card'], $patch['frameStyles']['card']);

        $this->client->request('GET', sprintf('/api/stores/%s', $this->store->getSlug()));
        self::assertResponseIsSuccessful();
        $read = json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame($styles['card']['borderThickness'], $read['frameStyles']['card']['borderThickness']);
    }

    public function testDarkFrameStylesPersistIndependently(): void
    {
        $light = [
            'hero' => ['borderThickness' => 1, 'borderGlow' => 0, 'surfaceBlur' => 8],
            'tile' => ['borderThickness' => 1, 'borderGlow' => 0, 'surfaceBlur' => 0],
            'card' => ['borderThickness' => 2, 'borderGlow' => 4, 'surfaceBlur' => 12],
        ];
        $dark = [
            'hero' => ['borderThickness' => 2, 'borderGlow' => 22, 'surfaceBlur' => 20],
            'tile' => ['borderThickness' => 1, 'borderGlow' => 8, 'surfaceBlur' => 10],
            'card' => ['borderThickness' => 3, 'borderGlow' => 14, 'surfaceBlur' => 28],
        ];
        $patch = $this->patchSettings([
            'frameStyles' => $light,
            'darkFrameStyles' => $dark,
            'borderColor' => '#e7e9ee',
            'darkColors' => ['borderColor' => '#2a2f47'],
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame($light['hero'], $patch['frameStyles']['hero']);
        self::assertSame($dark['hero'], $patch['darkFrameStyles']['hero']);
        self::assertSame('#2a2f47', $patch['darkColors']['borderColor']);

        $this->client->request('GET', sprintf('/api/stores/%s', $this->store->getSlug()));
        self::assertResponseIsSuccessful();
        $read = json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame($dark['card']['surfaceBlur'], $read['darkFrameStyles']['card']['surfaceBlur']);
        self::assertSame($light['card']['surfaceBlur'], $read['frameStyles']['card']['surfaceBlur']);
    }

    public function testPageBackgroundsPersistForLightAndDark(): void
    {
        $payload = [
            'pageBackgrounds' => [
                'light' => 'waves',
                'dark' => 'aurora',
                'opacity' => 55,
                'colors' => [
                    'light' => ['primary' => '#112233', 'secondary' => '#445566'],
                    'dark' => ['base' => '#0a0a0b'],
                ],
            ],
        ];
        $patch = $this->patchSettings($payload);
        self::assertResponseIsSuccessful();
        self::assertSame('waves', $patch['pageBackgrounds']['light']);
        self::assertSame('aurora', $patch['pageBackgrounds']['dark']);
        self::assertSame(55, $patch['pageBackgrounds']['opacity']);
        self::assertSame('#112233', $patch['pageBackgrounds']['colors']['light']['primary']);

        $this->client->request('GET', sprintf('/api/stores/%s', $this->store->getSlug()));
        self::assertResponseIsSuccessful();
        $read = json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('aurora', $read['pageBackgrounds']['dark']);
        self::assertSame('#112233', $read['pageBackgrounds']['colors']['light']['primary']);
        self::assertSame('#445566', $read['pageBackgrounds']['colors']['light']['secondary']);
        self::assertSame('#0a0a0b', $read['pageBackgrounds']['colors']['dark']['base']);
    }
}
