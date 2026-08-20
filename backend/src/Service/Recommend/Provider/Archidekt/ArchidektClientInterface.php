<?php

namespace App\Service\Recommend\Provider\Archidekt;

/**
 * Raw transport for Archidekt's deck API. Split from the provider so tests can
 * swap in fixtures and never reach the network.
 */
interface ArchidektClientInterface
{
    /**
     * Popularity-ordered Commander deck summaries mentioning a commander.
     *
     * The upstream filter matches decks that merely *contain* the named card,
     * so results must be verified against the deck's actual commander before
     * being trusted.
     *
     * @return list<array<string, mixed>> raw `results` entries
     */
    public function searchCommanderDecks(string $commanderName, int $pageSize): array;

    /**
     * Full deck payload including card rows and categories.
     *
     * @return array<string, mixed>|null null on any failure
     */
    public function fetchDeck(int $deckId): ?array;
}
