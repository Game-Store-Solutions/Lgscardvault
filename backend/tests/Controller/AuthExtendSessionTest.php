<?php

namespace App\Tests\Controller;

use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AuthExtendSessionTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private JWTTokenManagerInterface $jwt;

    protected function setUp(): void
    {
        self::bootKernel();
        /** @var CacheItemPoolInterface $pool */
        $pool = self::getContainer()->get('cache.rate_limiter');
        $pool->clear();
        self::ensureKernelShutdown();

        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->jwt = $c->get(JWTTokenManagerInterface::class);
    }

    /** @param array<string, mixed> $body */
    private function jsonRequest(string $method, string $url, array $body = []): array
    {
        $this->client->request($method, $url, server: ['CONTENT_TYPE' => 'application/json'], content: json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testExtendSessionMintsFreshToken(): void
    {
        $user = $this->fixtures->user(['ROLE_USER', 'ROLE_STORE_OWNER']);
        $token = $this->jwt->create($user);

        $body = $this->jsonRequest('POST', '/api/auth/extend-session', ['token' => $token]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), json_encode($body));
        self::assertIsString($body['token'] ?? null);
        self::assertNotSame('', $body['token']);

        // Fresh token can hit an authenticated endpoint.
        $this->client->request('GET', '/api/me', server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$body['token'],
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $me = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertSame($user->getEmail(), $me['email'] ?? null);
    }

    public function testExtendSessionRejectsGarbage(): void
    {
        $body = $this->jsonRequest('POST', '/api/auth/extend-session', ['token' => 'not-a-jwt']);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());
        self::assertArrayHasKey('error', $body);
    }
}
