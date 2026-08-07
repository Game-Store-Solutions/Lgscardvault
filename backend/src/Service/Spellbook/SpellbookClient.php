<?php

namespace App\Service\Spellbook;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Server-side proxy for Commander Spellbook's public REST API.
 *
 * Never call Spellbook from the browser — this keeps CORS, rate limits, and
 * caching under our control while still using their curated combo graph.
 */
final class SpellbookClient implements SpellbookClientInterface
{
    private const BASE = 'https://backend.commanderspellbook.com';
    private const CACHE_TTL = 3600;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function searchVariants(array $cardNames, int $pageSize = 24): array
    {
        $names = $this->normalizeNames($cardNames);
        if ([] === $names) {
            return [];
        }

        $pageSize = max(1, min(50, $pageSize));
        $cacheKey = 'spellbook_variants_'.hash('xxh128', implode('|', $names).'|'.$pageSize);

        return $this->cache->get($cacheKey, function (ItemInterface $item) use ($names, $pageSize): array {
            $item->expiresAfter(self::CACHE_TTL);
            try {
                $response = $this->httpClient->request('GET', self::BASE.'/variants/', [
                    'query' => [
                        'cards' => implode(',', $names),
                        'page_size' => $pageSize,
                        'status' => 'OK',
                    ],
                    'headers' => ['Accept' => 'application/json'],
                    'timeout' => 12,
                ]);
                if ($response->getStatusCode() >= 400) {
                    return [];
                }
                $payload = $response->toArray(false);

                return is_array($payload['results'] ?? null) ? $payload['results'] : [];
            } catch (\Throwable $e) {
                $this->logger->warning('Spellbook variants search failed: '.$e->getMessage());

                return [];
            }
        });
    }

    public function findMyCombos(array $mainNames, array $commanderNames = []): array
    {
        $main = $this->normalizeNames($mainNames);
        $commanders = $this->normalizeNames($commanderNames);
        if ([] === $main && [] === $commanders) {
            return ['identity' => null, 'included' => [], 'almostIncluded' => []];
        }

        $cacheKey = 'spellbook_fmc_'.hash('xxh128', implode('|', $main).'#'.implode('|', $commanders));

        return $this->cache->get($cacheKey, function (ItemInterface $item) use ($main, $commanders): array {
            $item->expiresAfter(self::CACHE_TTL);
            $empty = ['identity' => null, 'included' => [], 'almostIncluded' => []];
            try {
                $body = [
                    'main' => array_map(static fn (string $n): array => ['card' => $n], $main),
                    'commanders' => array_map(static fn (string $n): array => ['card' => $n], $commanders),
                ];
                $response = $this->httpClient->request('POST', self::BASE.'/find-my-combos', [
                    'json' => $body,
                    'headers' => ['Accept' => 'application/json', 'Content-Type' => 'application/json'],
                    'timeout' => 15,
                ]);
                if ($response->getStatusCode() >= 400) {
                    return $empty;
                }
                $payload = $response->toArray(false);
                $results = $payload['results'] ?? null;
                if (!is_array($results)) {
                    return $empty;
                }

                return [
                    'identity' => isset($results['identity']) ? (string) $results['identity'] : null,
                    'included' => is_array($results['included'] ?? null) ? $results['included'] : [],
                    'almostIncluded' => is_array($results['almostIncluded'] ?? null) ? $results['almostIncluded'] : [],
                ];
            } catch (\Throwable $e) {
                $this->logger->warning('Spellbook find-my-combos failed: '.$e->getMessage());

                return $empty;
            }
        });
    }

    /**
     * @param list<string> $names
     * @return list<string>
     */
    private function normalizeNames(array $names): array
    {
        $out = [];
        foreach ($names as $name) {
            $trimmed = trim((string) $name);
            if ('' === $trimmed) {
                continue;
            }
            // Collapse DFC names to the front face for Spellbook matching.
            if (str_contains($trimmed, ' // ')) {
                $trimmed = trim(explode(' // ', $trimmed, 2)[0]);
            }
            $out[$trimmed] = $trimmed;
        }

        return array_values($out);
    }
}
