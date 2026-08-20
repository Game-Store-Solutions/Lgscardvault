<?php

namespace App\Service\Recommend\Provider;

use App\Service\MTGJson\MTGJsonClient;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;

/**
 * Reference decks from Wizards' preconstructed Commander products, via MTGJSON.
 *
 * Thin but completely safe: MTGJSON is built for programmatic use, so this
 * provider needs no permission and never rate-limits us out. Most commanders
 * have zero or one precon, so treat it as a floor rather than a primary source —
 * a precon is a real, coherent, designer-built list, which makes it a decent
 * signal when nothing else is available.
 *
 * MTGJSON's deck index carries no commander field, so we build a
 * commander-oracle-id → deck index once and cache it. That costs ~190 requests,
 * which is why this provider is only ever driven from the background refresher.
 */
final class MtgJsonPreconDeckProvider implements DeckDataProviderInterface
{
    public const NAME = 'mtgjson-precon';

    private const INDEX_CACHE_KEY = 'mtgjson_commander_precon_index';

    public function __construct(
        private readonly MTGJsonClient $client,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
        private readonly bool $enabled = true,
        private readonly int $cacheTtl = 2592000,
    ) {
    }

    public function name(): string
    {
        return self::NAME;
    }

    public function isAvailable(): bool
    {
        return $this->enabled;
    }

    public function getDecksForCommander(string $commanderOracleId, string $commanderName, int $limit): array
    {
        return $this->getPopularDecks($commanderOracleId, $commanderName, null, $limit);
    }

    public function getDecksForCommanderAndStrategy(
        string $commanderOracleId,
        string $commanderName,
        string $strategyId,
        int $limit,
    ): array {
        // Precons carry no archetype tags, so there is nothing to filter on.
        // Returning the commander's precons lets the caller's own classifier
        // decide whether they match the requested strategy.
        return $this->getPopularDecks($commanderOracleId, $commanderName, null, $limit);
    }

    public function getPopularDecks(
        string $commanderOracleId,
        string $commanderName,
        ?string $strategyId,
        int $limit,
    ): array {
        if (!$this->enabled || $limit < 1) {
            return [];
        }

        $oracleId = strtolower(trim($commanderOracleId));
        $fileNames = $this->index()[$oracleId] ?? [];
        if ([] === $fileNames) {
            return [];
        }

        $out = [];
        foreach ($fileNames as $fileName) {
            if (count($out) >= $limit) {
                break;
            }
            $payload = $this->loadDeck($fileName, $oracleId);
            if (null !== $payload) {
                $out[] = $payload;
            }
        }

        return $out;
    }

    private function loadDeck(string $fileName, string $commanderOracleId): ?ReferenceDeckPayload
    {
        $deck = $this->client->getDeck($fileName);
        if (null === $deck) {
            return null;
        }

        $commanders = [];
        foreach ($deck['commander'] as $row) {
            $oracle = $this->oracleId($row);
            if (null !== $oracle) {
                $commanders[$oracle] = true;
            }
        }
        if (!isset($commanders[$commanderOracleId])) {
            return null;
        }

        $cards = [];
        foreach ($deck['mainBoard'] as $row) {
            $oracle = $this->oracleId($row);
            if (null === $oracle || isset($commanders[$oracle])) {
                continue;
            }
            $cards[$oracle] = ($cards[$oracle] ?? 0) + max(1, (int) ($row['count'] ?? 1));
        }
        if ([] === $cards) {
            return null;
        }

        return new ReferenceDeckPayload(
            provider: self::NAME,
            externalId: $fileName,
            name: $deck['name'],
            commanderOracleIds: array_keys($commanders),
            cards: $cards,
            // A precon is an official product rather than a popularity ranking.
            // Give it a moderate constant so it never outranks a genuinely
            // popular community list but always beats nothing.
            popularity: 0.5,
            bracket: 2,
            updatedAt: $this->parseDate($deck['releaseDate']),
        );
    }

    /**
     * commander oracle id => precon file names.
     *
     * @return array<string, list<string>>
     */
    private function index(): array
    {
        return $this->cache->get(self::INDEX_CACHE_KEY, function (ItemInterface $item): array {
            $item->expiresAfter($this->cacheTtl);

            $decks = $this->client->getDeckList(MTGJsonClient::DECK_TYPE_COMMANDER);
            if ([] === $decks) {
                return [];
            }

            $index = [];
            $seenSignatures = [];
            foreach ($decks as $entry) {
                $deck = $this->client->getDeck($entry['fileName']);
                if (null === $deck || [] === $deck['commander']) {
                    continue;
                }

                $commanders = [];
                foreach ($deck['commander'] as $row) {
                    $oracle = $this->oracleId($row);
                    if (null !== $oracle) {
                        $commanders[$oracle] = true;
                    }
                }
                if ([] === $commanders) {
                    continue;
                }

                // Collector's Edition reprints duplicate the same 100 cards.
                // Keeping both would double-count every card's inclusion rate.
                $mainOracles = [];
                foreach ($deck['mainBoard'] as $row) {
                    $oracle = $this->oracleId($row);
                    if (null !== $oracle) {
                        $mainOracles[] = $oracle;
                    }
                }
                sort($mainOracles);
                $signature = hash('xxh128', implode(',', array_keys($commanders)).'#'.implode(',', $mainOracles));
                if (isset($seenSignatures[$signature])) {
                    continue;
                }
                $seenSignatures[$signature] = true;

                foreach (array_keys($commanders) as $oracle) {
                    $index[$oracle][] = $entry['fileName'];
                }
            }

            $this->logger->info('Built MTGJSON commander precon index: {commanders} commanders across {decks} decks.', [
                'commanders' => count($index),
                'decks' => count($seenSignatures),
            ]);

            return $index;
        });
    }

    /** @param array<string, mixed> $row */
    private function oracleId(array $row): ?string
    {
        $oracle = $row['identifiers']['scryfallOracleId'] ?? null;
        if (!is_string($oracle) || '' === trim($oracle)) {
            return null;
        }

        return strtolower(trim($oracle));
    }

    private function parseDate(string $value): ?\DateTimeImmutable
    {
        if ('' === trim($value)) {
            return null;
        }
        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            return null;
        }
    }
}
