<?php

namespace App\Service\Tcgcsv;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Thin HTTP wrapper around TCGCSV (https://tcgcsv.com), the free daily
 * mirror of the TCGplayer catalog. All endpoints return `{results: [...]}`;
 * this client unwraps that envelope and nothing more — interpretation
 * (card vs sealed, upserts, pricing) lives in CatalogSynchronizer.
 *
 * Base URI, timeouts, User-Agent, and retry-with-backoff are configured on
 * the scoped `tcgcsv.client` (see config/packages/http_client.yaml). On top
 * of that this client paces its own requests: a full game sync is thousands
 * of calls against a free service, and TCGCSV asks integrators not to rush.
 */
final class TcgcsvClient
{
    /** Minimum gap between requests, in microseconds (~10 req/s). */
    public const REQUEST_INTERVAL_US = 100_000;

    private float $lastRequestAt = 0.0;

    /**
     * @param int $requestIntervalUs minimum gap between requests; tests pass 0
     *                               so a mocked mirror isn't paced for nothing
     */
    public function __construct(
        private readonly HttpClientInterface $tcgcsvClient,
        private readonly int $requestIntervalUs = self::REQUEST_INTERVAL_US,
    ) {
    }

    /** @return list<array<string, mixed>> all TCGplayer categories (games) */
    public function fetchCategories(): array
    {
        return $this->fetchResults('categories');
    }

    /** @return list<array<string, mixed>> groups (sets) for one category */
    public function fetchGroups(int $categoryId): array
    {
        return $this->fetchResults(sprintf('%d/groups', $categoryId));
    }

    /** @return list<array<string, mixed>> products (cards + sealed) in one group */
    public function fetchProducts(int $categoryId, int $groupId): array
    {
        return $this->fetchResults(sprintf('%d/%d/products', $categoryId, $groupId));
    }

    /** @return list<array<string, mixed>> price rows (per product + subtype) in one group */
    public function fetchPrices(int $categoryId, int $groupId): array
    {
        return $this->fetchResults(sprintf('%d/%d/prices', $categoryId, $groupId));
    }

    /** @return list<array<string, mixed>> */
    private function fetchResults(string $path): array
    {
        $this->pace();

        $payload = $this->tcgcsvClient->request('GET', $path)->toArray();

        $results = $payload['results'] ?? null;
        if (!is_array($results)) {
            throw new \RuntimeException(sprintf('Unexpected TCGCSV response from %s: missing "results".', $path));
        }

        return array_values(array_filter($results, 'is_array'));
    }

    /** Sleeps just long enough to keep requests at most ~10/s. */
    private function pace(): void
    {
        if ($this->requestIntervalUs <= 0) {
            return;
        }

        $elapsedUs = (microtime(true) - $this->lastRequestAt) * 1_000_000;
        if ($this->lastRequestAt > 0.0 && $elapsedUs < $this->requestIntervalUs) {
            usleep((int) ($this->requestIntervalUs - $elapsedUs));
        }

        $this->lastRequestAt = microtime(true);
    }
}
