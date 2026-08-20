<?php

namespace App\Service\Recommend\Provider;

use Psr\Log\LoggerInterface;

/**
 * Merges every configured deck source into one pool.
 *
 * This is the seam that keeps the recommendation engine provider-independent:
 * downstream code depends on this interface, so adding, replacing, or disabling
 * a source never touches scoring, classification, or deck building.
 *
 * Providers are tried in registration order and their results concatenated.
 * A provider that throws or returns nothing is logged and skipped, so one
 * failing source degrades data volume rather than breaking deck building.
 */
final class CompositeDeckDataProvider implements DeckDataProviderInterface
{
    /** @var list<DeckDataProviderInterface> */
    private readonly array $providers;

    /**
     * @param iterable<DeckDataProviderInterface> $providers
     */
    public function __construct(
        iterable $providers,
        private readonly LoggerInterface $logger,
    ) {
        $flat = [];
        foreach ($providers as $provider) {
            if (!$provider instanceof self) {
                $flat[] = $provider;
            }
        }
        $this->providers = $flat;
    }

    public function name(): string
    {
        return 'composite';
    }

    public function isAvailable(): bool
    {
        foreach ($this->providers as $provider) {
            if ($provider->isAvailable()) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> names of providers currently usable */
    public function availableProviderNames(): array
    {
        $names = [];
        foreach ($this->providers as $provider) {
            if ($provider->isAvailable()) {
                $names[] = $provider->name();
            }
        }

        return $names;
    }

    public function getDecksForCommander(string $commanderOracleId, string $commanderName, int $limit): array
    {
        return $this->collect(
            static fn (DeckDataProviderInterface $p, int $remaining): array => $p->getDecksForCommander($commanderOracleId, $commanderName, $remaining),
            $limit,
        );
    }

    public function getDecksForCommanderAndStrategy(
        string $commanderOracleId,
        string $commanderName,
        string $strategyId,
        int $limit,
    ): array {
        return $this->collect(
            static fn (DeckDataProviderInterface $p, int $remaining): array => $p->getDecksForCommanderAndStrategy($commanderOracleId, $commanderName, $strategyId, $remaining),
            $limit,
        );
    }

    public function getPopularDecks(
        string $commanderOracleId,
        string $commanderName,
        ?string $strategyId,
        int $limit,
    ): array {
        return $this->collect(
            static fn (DeckDataProviderInterface $p, int $remaining): array => $p->getPopularDecks($commanderOracleId, $commanderName, $strategyId, $remaining),
            $limit,
        );
    }

    /**
     * @param callable(DeckDataProviderInterface, int): list<ReferenceDeckPayload> $fetch
     *
     * @return list<ReferenceDeckPayload>
     */
    private function collect(callable $fetch, int $limit): array
    {
        if ($limit < 1) {
            return [];
        }

        $out = [];
        $seen = [];
        foreach ($this->providers as $provider) {
            $remaining = $limit - count($out);
            if ($remaining < 1) {
                break;
            }
            if (!$provider->isAvailable()) {
                continue;
            }

            try {
                $decks = $fetch($provider, $remaining);
            } catch (\Throwable $e) {
                $this->logger->warning('Deck provider "{provider}" failed: {message}', [
                    'provider' => $provider->name(),
                    'message' => $e->getMessage(),
                ]);
                continue;
            }

            foreach ($decks as $deck) {
                $key = $deck->provider.':'.$deck->externalId;
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $out[] = $deck;
            }
        }

        return $out;
    }
}
