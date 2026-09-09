<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreKioskExitCodeTest extends WebTestCase
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
        $this->store = $this->fixtures->store('kiosk-exit-code-store');
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

    /** @param array<string, mixed> $body */
    private function verifyExit(array $body): void
    {
        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/kiosk/verify-exit', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode($body),
        );
    }

    public function testSetVerifyAndClearExitCode(): void
    {
        $read = $this->patchSettings([]);
        self::assertResponseIsSuccessful();
        self::assertArrayHasKey('kioskExitCodeSet', $read);
        self::assertFalse($read['kioskExitCodeSet']);

        $this->verifyExit(['code' => '1234']);
        self::assertResponseIsSuccessful();

        $saved = $this->patchSettings(['kioskExitCode' => 'vault99']);
        self::assertResponseIsSuccessful();
        self::assertTrue($saved['kioskExitCodeSet']);
        self::assertArrayNotHasKey('kioskExitCode', $saved);
        self::assertArrayNotHasKey('kioskExitCodeHash', $saved);

        $this->client->request(
            'GET',
            sprintf('/api/stores/%s', $this->store->getSlug()),
            server: ['HTTP_ACCEPT' => 'application/json'],
        );
        self::assertResponseIsSuccessful();
        $public = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertTrue($public['kioskExitCodeSet']);
        self::assertArrayNotHasKey('kioskExitCodeHash', $public);

        $this->verifyExit(['code' => 'wrong']);
        self::assertResponseStatusCodeSame(403);

        $this->verifyExit(['code' => 'vault99']);
        self::assertResponseIsSuccessful();

        $cleared = $this->patchSettings(['kioskExitCode' => '']);
        self::assertResponseIsSuccessful();
        self::assertFalse($cleared['kioskExitCodeSet']);
    }

    public function testRejectsInvalidExitCodeShape(): void
    {
        $this->patchSettings(['kioskExitCode' => '12']);
        self::assertResponseStatusCodeSame(422);

        $this->patchSettings(['kioskExitCode' => 'code with spaces']);
        self::assertResponseStatusCodeSame(422);
    }

    public function testPlatformAdminCanStartKioskSession(): void
    {
        $this->patchSettings(['kioskExitCode' => 'vault99']);
        self::assertResponseIsSuccessful();

        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $adminBearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($admin);

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/kiosk/start', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$adminBearer,
            ],
        );

        self::assertResponseIsSuccessful();
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsString($payload['token'] ?? null);
        self::assertNotSame('', $payload['token']);
    }
}
