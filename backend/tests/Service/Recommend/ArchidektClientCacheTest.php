<?php

namespace App\Tests\Service\Recommend;

use App\Service\Recommend\Provider\Archidekt\ArchidektCircuitBreaker;
use App\Service\Recommend\Provider\Archidekt\ArchidektClient;
use App\Service\Recommend\Provider\Archidekt\ArchidektRateLimiter;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Contracts\Cache\CacheInterface;

final class ArchidektClientCacheTest extends TestCase
{
    public function testHttpFailuresAreNotCachedSoRetryCanSucceed(): void
    {
        $calls = 0;
        $http = new MockHttpClient(function () use (&$calls): MockResponse {
            ++$calls;
            if (1 === $calls) {
                return new MockResponse('rate limited', ['http_code' => 429]);
            }

            return new MockResponse(json_encode([
                'cards' => [['quantity' => 1]],
            ], JSON_THROW_ON_ERROR), ['http_code' => 200]);
        });

        $client = $this->client($http, $this->cache());

        self::assertNull($client->fetchDeck(42), 'first call fails with 429');
        self::assertNotNull($client->fetchDeck(42), 'second call must hit the network again');
        self::assertSame(2, $calls);
    }

    public function testSuccessfulDeckIsCached(): void
    {
        $calls = 0;
        $http = new MockHttpClient(function () use (&$calls): MockResponse {
            ++$calls;

            return new MockResponse(json_encode([
                'cards' => [['quantity' => 1]],
            ], JSON_THROW_ON_ERROR), ['http_code' => 200]);
        });

        $client = $this->client($http, $this->cache());

        self::assertNotNull($client->fetchDeck(7));
        self::assertNotNull($client->fetchDeck(7));
        self::assertSame(1, $calls);
    }

    private function cache(): CacheInterface
    {
        return new ArrayAdapter();
    }

    private function client(MockHttpClient $http, CacheInterface $cache): ArchidektClient
    {
        $rateLock = sys_get_temp_dir().'/archidekt_rate_test_'.bin2hex(random_bytes(4)).'.lock';
        $circuit = sys_get_temp_dir().'/archidekt_circuit_test_'.bin2hex(random_bytes(4)).'.json';

        return new ArchidektClient(
            $http,
            $cache,
            new NullLogger(),
            new ArchidektRateLimiter($rateLock, 0),
            new ArchidektCircuitBreaker($circuit, failureThreshold: 50, cooldownSeconds: 3600),
            cacheTtl: 60,
        );
    }
}
