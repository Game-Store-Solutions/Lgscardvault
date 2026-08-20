<?php

namespace App\Service\Recommend\Provider\Archidekt;

use App\Service\Recommend\Intelligence\StrategyTaxonomy;
use App\Service\Recommend\Provider\DeckDataProviderInterface;
use App\Service\Recommend\Provider\ReferenceDeckPayload;
use Psr\Log\LoggerInterface;

/**
 * Reference decks from Archidekt.
 *
 * Two properties make this the richest available source: card rows carry
 * Scryfall oracle ids (so we join on identity, never on name) and decks carry
 * builder-authored strategy tags ("Tokens", "+1/+1 Counters"), which are a far
 * better archetype signal than anything we could infer.
 *
 * The single most important detail here is commander verification. Archidekt's
 * `commanderName` filter matches decks that merely *contain* the named card, so
 * a search for "Anim Pakal, Thousandth Moon" happily returns Aurelia decks that
 * run her as a creature. Trusting the filter would quietly poison the reference
 * pool with the wrong archetype, so every deck is re-checked against its own
 * Commander category before we keep it.
 */
final class ArchidektDeckDataProvider implements DeckDataProviderInterface
{
    public const NAME = 'archidekt';

    private const COMMANDER_CATEGORY = 'commander';

    /**
     * Views that map to a popularity of 1.0 on a log scale. Archidekt's most
     * viewed commander decks sit in the tens of thousands.
     */
    private const POPULARITY_CEILING_LOG = 5.0;

    public function __construct(
        private readonly ArchidektClientInterface $client,
        private readonly StrategyTaxonomy $taxonomy,
        private readonly LoggerInterface $logger,
        private readonly bool $enabled = false,
        private readonly int $harvestDepth = 12,
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
        return $this->getPopularDecks($commanderOracleId, $commanderName, $strategyId, $limit);
    }

    public function getPopularDecks(
        string $commanderOracleId,
        string $commanderName,
        ?string $strategyId,
        int $limit,
    ): array {
        if (!$this->enabled || '' === trim($commanderName) || $limit < 1) {
            return [];
        }

        $summaries = $this->client->searchCommanderDecks($commanderName, $this->harvestDepth);
        if ([] === $summaries) {
            return [];
        }

        $out = [];
        $inspected = 0;
        foreach ($summaries as $summary) {
            if (count($out) >= $limit || $inspected >= $this->harvestDepth) {
                break;
            }
            if (!$this->summaryIsPlausible($summary)) {
                continue;
            }

            $tags = $this->tagNames($summary);
            // Strategy filtering happens here rather than upstream: Archidekt's
            // search accepts no tag parameter (`deckTags`/`tags` are ignored),
            // so narrowing before the detail fetch is the only way to avoid
            // paying a request for decks we would discard anyway.
            if (null !== $strategyId && !$this->matchesStrategy($tags, $strategyId)) {
                continue;
            }

            $deckId = (int) ($summary['id'] ?? 0);
            ++$inspected;
            $detail = $this->client->fetchDeck($deckId);
            if (null === $detail) {
                continue;
            }

            $payload = $this->normalize($deckId, $summary, $detail, $tags);
            if (null === $payload) {
                continue;
            }
            if (!$payload->hasCommander($commanderOracleId)) {
                // Expected and common: the search matched a deck that merely
                // runs this card in the 99.
                continue;
            }
            if (!$payload->looksLikeCommanderDeck()) {
                continue;
            }

            $out[] = $payload;
        }

        return $out;
    }

    /**
     * Cheap pre-filter on the search summary so we never spend a request on a
     * deck we already know is unusable.
     *
     * @param array<string, mixed> $summary
     */
    private function summaryIsPlausible(array $summary): bool
    {
        if ((int) ($summary['id'] ?? 0) <= 0) {
            return false;
        }
        if (!empty($summary['private']) || !empty($summary['unlisted']) || !empty($summary['theorycrafted'])) {
            return false;
        }
        // `size` counts every row including maybeboards, so allow slack above
        // 100 and only reject lists that clearly are not a built deck.
        $size = (int) ($summary['size'] ?? 0);

        return $size >= 90 && $size <= 180;
    }

    /**
     * @param array<string, mixed> $summary
     *
     * @return list<string>
     */
    private function tagNames(array $summary): array
    {
        $tags = [];
        foreach ((array) ($summary['tags'] ?? []) as $tag) {
            $name = is_array($tag) ? ($tag['name'] ?? null) : $tag;
            if (is_string($name) && '' !== trim($name)) {
                $tags[trim($name)] = true;
            }
        }

        return array_keys($tags);
    }

    /** @param list<string> $tags */
    private function matchesStrategy(array $tags, string $strategyId): bool
    {
        return in_array($strategyId, $this->taxonomy->normalizeTags($tags), true);
    }

    /**
     * @param array<string, mixed> $summary
     * @param array<string, mixed> $detail
     * @param list<string>         $tags
     */
    private function normalize(int $deckId, array $summary, array $detail, array $tags): ?ReferenceDeckPayload
    {
        $excluded = $this->excludedCategories($detail);

        $cards = [];
        $commanders = [];
        $roleHints = [];

        foreach ((array) ($detail['cards'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $oracleId = $this->oracleId($row);
            if (null === $oracleId) {
                continue;
            }

            $categories = array_values(array_filter(
                array_map(static fn ($c): string => is_string($c) ? $c : '', (array) ($row['categories'] ?? [])),
            ));

            // Archidekt models maybeboards, wish lists and cut piles as
            // categories flagged includedInDeck=false. Dropping any card that
            // belongs to one reproduces the site's own mainboard exactly — the
            // remaining quantities sum to 100 on a finished deck.
            if ($this->isExcluded($categories, $excluded)) {
                continue;
            }

            if ($this->isCommanderRow($categories)) {
                $commanders[$oracleId] = true;
                continue;
            }

            $quantity = max(1, (int) ($row['quantity'] ?? 1));
            $cards[$oracleId] = ($cards[$oracleId] ?? 0) + $quantity;

            $hint = $this->roleHint($row, $categories);
            if (null !== $hint && !isset($roleHints[$oracleId])) {
                $roleHints[$oracleId] = $hint;
            }
        }

        if ([] === $commanders || [] === $cards) {
            return null;
        }

        return new ReferenceDeckPayload(
            provider: self::NAME,
            externalId: (string) $deckId,
            name: (string) ($detail['name'] ?? $summary['name'] ?? 'Archidekt deck '.$deckId),
            commanderOracleIds: array_keys($commanders),
            cards: $cards,
            providerTags: $tags,
            roleHints: $roleHints,
            popularity: $this->popularity($summary),
            bracket: $this->bracket($summary, $detail),
            updatedAt: $this->parseDate($detail['updatedAt'] ?? $summary['updatedAt'] ?? null),
            url: 'https://archidekt.com/decks/'.$deckId,
        );
    }

    /**
     * @param array<string, mixed> $detail
     *
     * @return array<string, true> lowercased category names not counted in the deck
     */
    private function excludedCategories(array $detail): array
    {
        $excluded = [];
        foreach ((array) ($detail['categories'] ?? []) as $category) {
            if (!is_array($category)) {
                continue;
            }
            $name = $category['name'] ?? null;
            if (!is_string($name) || '' === trim($name)) {
                continue;
            }
            // Absent flag means included, matching Archidekt's own default.
            if (array_key_exists('includedInDeck', $category) && !$category['includedInDeck']) {
                $excluded[strtolower(trim($name))] = true;
            }
        }

        return $excluded;
    }

    /**
     * @param list<string>        $categories
     * @param array<string, true> $excluded
     */
    private function isExcluded(array $categories, array $excluded): bool
    {
        foreach ($categories as $category) {
            if (isset($excluded[strtolower(trim($category))])) {
                return true;
            }
        }

        return false;
    }

    /** @param list<string> $categories */
    private function isCommanderRow(array $categories): bool
    {
        foreach ($categories as $category) {
            if (self::COMMANDER_CATEGORY === strtolower(trim($category))) {
                return true;
            }
        }

        return false;
    }

    /** @param array<string, mixed> $row */
    private function oracleId(array $row): ?string
    {
        $uid = $row['card']['oracleCard']['uid'] ?? null;
        if (!is_string($uid) || '' === trim($uid)) {
            return null;
        }

        return strtolower(trim($uid));
    }

    /**
     * A coarse role label from Archidekt's own tagging: the builder's category
     * first (they know their deck), falling back to the card's default
     * category. Only used as a hint — our own classifier still has the final say.
     *
     * @param array<string, mixed> $row
     * @param list<string>         $categories
     */
    private function roleHint(array $row, array $categories): ?string
    {
        $default = $row['card']['oracleCard']['defaultCategory'] ?? null;
        foreach ($categories as $category) {
            $trimmed = trim($category);
            if ('' !== $trimmed) {
                return $trimmed;
            }
        }

        return is_string($default) && '' !== trim($default) ? trim($default) : null;
    }

    /** @param array<string, mixed> $summary */
    private function popularity(array $summary): float
    {
        $views = max(0, (int) ($summary['viewCount'] ?? 0));
        if (0 === $views) {
            return 0.0;
        }

        return min(1.0, log10(1.0 + $views) / self::POPULARITY_CEILING_LOG);
    }

    /**
     * @param array<string, mixed> $summary
     * @param array<string, mixed> $detail
     */
    private function bracket(array $summary, array $detail): ?int
    {
        foreach ([$detail['edhBracket'] ?? null, $summary['edhBracket'] ?? null] as $value) {
            if (is_int($value) && $value >= 1 && $value <= 5) {
                return $value;
            }
        }

        return null;
    }

    private function parseDate(mixed $value): ?\DateTimeImmutable
    {
        if (!is_string($value) || '' === trim($value)) {
            return null;
        }
        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            $this->logger->debug('Archidekt returned an unparsable date: '.$value);

            return null;
        }
    }
}
