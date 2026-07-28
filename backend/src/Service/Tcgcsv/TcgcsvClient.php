<?php

namespace App\Service\Tcgcsv;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Thin HTTP wrapper around TCGCSV (https://tcgcsv.com), the free daily
 * mirror of the TCGplayer catalog. All endpoints return `{results: [...]}`;
 * this client unwraps that envelope and nothing more — interpretation
 * (card vs sealed, upserts, pricing) lives in CatalogSynchronizer.
 *
 * TCGCSV refreshes once daily at 20:00 UTC, so responses are stable within
 * a day and polite request pacing matters more than caching here.
 */
final readonly class TcgcsvClient
{
    private const BASE_URI = 'https://tcgcsv.com/tcgplayer';

    public function __construct(
        private HttpClientInterface $tcgcsvHttpClient,
    ) {
    }

    /** @return list<array<string, mixed>> all TCGplayer categories (games) */
    public function fetchCategories(): array
    {
        return $this->fetchResults(self::BASE_URI.'/categories');
    }

    /** @return list<array<string, mixed>> groups (sets) for one category */
    public function fetchGroups(int $categoryId): array
    {
        return $this->fetchResults(sprintf('%s/%d/groups', self::BASE_URI, $categoryId));
    }

    /** @return list<array<string, mixed>> products (cards + sealed) in one group */
    public function fetchProducts(int $categoryId, int $groupId): array
    {
        return $this->fetchResults(sprintf('%s/%d/%d/products', self::BASE_URI, $categoryId, $groupId));
    }

    /** @return list<array<string, mixed>> price rows (per product + subtype) in one group */
    public function fetchPrices(int $categoryId, int $groupId): array
    {
        return $this->fetchResults(sprintf('%s/%d/%d/prices', self::BASE_URI, $categoryId, $groupId));
    }

    /** @return list<array<string, mixed>> */
    private function fetchResults(string $url): array
    {
        $payload = $this->tcgcsvHttpClient->request('GET', $url)->toArray();

        $results = $payload['results'] ?? null;
        if (!is_array($results)) {
            throw new \RuntimeException(sprintf('Unexpected TCGCSV response from %s: missing "results".', $url));
        }

        return array_values(array_filter($results, 'is_array'));
    }
}
