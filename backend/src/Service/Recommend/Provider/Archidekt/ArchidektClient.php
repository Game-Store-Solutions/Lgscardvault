<?php

namespace App\Service\Recommend\Provider\Archidekt;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Transport for Archidekt's deck API.
 *
 * Operational notes, because this endpoint carries real risk:
 *
 *  - Archidekt publishes no API documentation and has said publicly they do not
 *    intend to maintain a public API, so response shapes can change without
 *    notice. Every read here is defensive and failures degrade to empty results.
 *  - Their terms grant a personal, noncommercial license and prohibit automated
 *    queries, so this client is gated behind ARCHIDEKT_ENABLED and should not be
 *    switched on for commercial traffic without written permission.
 *  - No documented rate limit exists. We self-impose a host-wide lock and cache
 *    successful responses aggressively (a week by default). Failures are never
 *    written to that cache — a 429 storm must not poison the next harvest.
 *
 * `deckFormat=3` is Archidekt's Commander/EDH format id.
 */
final class ArchidektClient implements ArchidektClientInterface
{
    private const BASE = 'https://archidekt.com/api';
    private const FORMAT_COMMANDER = 3;
    private const SEARCH_TIMEOUT = 15;
    private const DECK_TIMEOUT = 25;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
        private readonly ArchidektRateLimiter $rateLimiter,
        private readonly ArchidektCircuitBreaker $circuitBreaker,
        private readonly int $cacheTtl = 604800,
        private readonly string $userAgent = 'LgsCardVault/1.0 (+deck recommendation engine)',
    ) {
    }

    public function searchCommanderDecks(string $commanderName, int $pageSize): array
    {
        $name = trim($commanderName);
        if ('' === $name) {
            return [];
        }
        $pageSize = max(1, min(100, $pageSize));
        $cacheKey = 'archidekt_search_'.hash('xxh128', $name.'|'.$pageSize);

        try {
            return $this->cache->get($cacheKey, function (ItemInterface $item) use ($name, $pageSize): array {
                $item->expiresAfter($this->cacheTtl);
                $payload = $this->request(self::BASE.'/decks/v3/', [
                    'formats' => self::FORMAT_COMMANDER,
                    'orderBy' => '-viewCount',
                    'commanderName' => $name,
                    'pageSize' => $pageSize,
                ], self::SEARCH_TIMEOUT);

                $results = $payload['results'] ?? null;

                return is_array($results) ? array_values(array_filter($results, 'is_array')) : [];
            });
        } catch (ArchidektTransientException $e) {
            $this->logger->warning('Archidekt search skipped: '.$e->getMessage());

            return [];
        }
    }

    public function fetchDeck(int $deckId): ?array
    {
        if ($deckId <= 0) {
            return null;
        }

        try {
            return $this->cache->get('archidekt_deck_'.$deckId, function (ItemInterface $item) use ($deckId): ?array {
                $item->expiresAfter($this->cacheTtl);
                $payload = $this->request(self::BASE.'/decks/'.$deckId.'/', [], self::DECK_TIMEOUT);

                return isset($payload['cards']) && is_array($payload['cards']) ? $payload : null;
            });
        } catch (ArchidektTransientException $e) {
            $this->logger->warning('Archidekt deck {id} skipped: {message}', [
                'id' => $deckId,
                'message' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @param array<string, mixed> $query
     *
     * @return array<string, mixed>
     */
    private function request(string $url, array $query, int $timeout): array
    {
        if (!$this->circuitBreaker->allow()) {
            throw new ArchidektTransientException(sprintf('circuit open; skipping %s', $url));
        }

        $this->rateLimiter->acquire();

        try {
            $response = $this->httpClient->request('GET', $url, [
                'query' => $query,
                'headers' => [
                    'Accept' => 'application/json',
                    'User-Agent' => $this->userAgent,
                ],
                'timeout' => $timeout,
            ]);
            $status = $response->getStatusCode();
            if ($status >= 400) {
                $this->circuitBreaker->recordFailure();
                throw new ArchidektTransientException(sprintf('HTTP %d for %s', $status, $url));
            }

            $payload = $response->toArray(false);
            $this->circuitBreaker->recordSuccess();

            return is_array($payload) ? $payload : [];
        } catch (ArchidektTransientException $e) {
            throw $e;
        } catch (\Throwable $e) {
            $this->circuitBreaker->recordFailure();
            throw new ArchidektTransientException($e->getMessage(), 0, $e);
        }
    }
}
