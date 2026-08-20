<?php

namespace App\Service\Recommend\Provider;

/**
 * Source of community/reference Commander decklists.
 *
 * Deliberately separate from card metadata (MTGJSON/Scryfall) because the two
 * answer different questions: metadata says what a card *is*, reference decks
 * say what actually gets played together. MTGJSON cannot back this interface —
 * its deck files are Wizards precon products with no popularity signal.
 *
 * Implementations must never throw for transient failures; return an empty list
 * so deck building degrades instead of breaking.
 */
interface DeckDataProviderInterface
{
    public function name(): string;

    /**
     * False when the provider is disabled by config or missing credentials, so
     * the composite can skip it without paying for a failed request.
     */
    public function isAvailable(): bool;

    /**
     * @return list<ReferenceDeckPayload> decks whose commander is $commanderOracleId
     */
    public function getDecksForCommander(string $commanderOracleId, string $commanderName, int $limit): array;

    /**
     * Decks for a commander narrowed to one strategy. Providers that can filter
     * server-side should; the rest may return the commander pool and let the
     * caller filter, which is what happens today.
     *
     * @return list<ReferenceDeckPayload>
     */
    public function getDecksForCommanderAndStrategy(
        string $commanderOracleId,
        string $commanderName,
        string $strategyId,
        int $limit,
    ): array;

    /**
     * Popularity-ordered decks, optionally strategy-filtered. This is the entry
     * point the harvester uses; the two methods above exist for callers that
     * want an explicit contract.
     *
     * @return list<ReferenceDeckPayload>
     */
    public function getPopularDecks(
        string $commanderOracleId,
        string $commanderName,
        ?string $strategyId,
        int $limit,
    ): array;
}
