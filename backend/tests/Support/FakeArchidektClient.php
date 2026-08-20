<?php

namespace App\Tests\Support;

use App\Service\Recommend\Provider\Archidekt\ArchidektClientInterface;

/**
 * Network-free Archidekt client.
 *
 * Emits payloads in the real API's shape — nested `card.oracleCard.uid`,
 * per-card `categories`, deck-level `categories` with `includedInDeck` flags —
 * so the provider's actual normalization, mainboard extraction, and commander
 * verification all run under test. A double that returned pre-normalized data
 * would test nothing but itself.
 */
final class FakeArchidektClient implements ArchidektClientInterface
{
    /** @var array<string, list<int>> lowercased commander name => deck ids */
    private array $searchIndex = [];

    /** @var array<int, array<string, mixed>> */
    private array $summaries = [];

    /** @var array<int, array<string, mixed>> */
    private array $details = [];

    public int $searchCalls = 0;
    public int $deckCalls = 0;

    /**
     * Register a deck that will be returned when searching for $commanderName.
     *
     * @param list<string>          $commanderOracleIds
     * @param array<string, int>    $cards              oracle id => quantity
     * @param list<string>          $tags               strategy tags as a builder would write them
     * @param array<string, string> $categories         oracle id => builder category
     * @param list<string>          $maybeboard         oracle ids to place in an excluded category
     */
    public function addDeck(
        int $deckId,
        string $commanderName,
        array $commanderOracleIds,
        array $cards,
        array $tags = [],
        int $viewCount = 1000,
        array $categories = [],
        array $maybeboard = [],
        ?int $bracket = null,
    ): void {
        $rows = [];

        foreach ($commanderOracleIds as $oracleId) {
            $rows[] = $this->cardRow($oracleId, 1, ['Commander']);
        }
        foreach ($cards as $oracleId => $quantity) {
            $rows[] = $this->cardRow(
                (string) $oracleId,
                (int) $quantity,
                [$categories[(string) $oracleId] ?? 'Creature'],
            );
        }
        foreach ($maybeboard as $oracleId) {
            $rows[] = $this->cardRow((string) $oracleId, 1, ['Maybeboard']);
        }

        $size = count($commanderOracleIds) + array_sum($cards) + count($maybeboard);

        $this->summaries[$deckId] = [
            'id' => $deckId,
            'name' => 'Fake deck '.$deckId,
            'size' => $size,
            'deckFormat' => 3,
            'edhBracket' => $bracket,
            'viewCount' => $viewCount,
            'private' => false,
            'unlisted' => false,
            'theorycrafted' => false,
            'updatedAt' => '2026-01-01T00:00:00Z',
            'tags' => array_map(static fn (string $t): array => ['name' => $t], $tags),
        ];

        $this->details[$deckId] = [
            'id' => $deckId,
            'name' => 'Fake deck '.$deckId,
            'updatedAt' => '2026-01-01T00:00:00Z',
            'edhBracket' => $bracket,
            'categories' => [
                ['name' => 'Commander', 'includedInDeck' => true],
                ['name' => 'Creature', 'includedInDeck' => true],
                ['name' => 'Land', 'includedInDeck' => true],
                ['name' => 'Ramp', 'includedInDeck' => true],
                ['name' => 'Maybeboard', 'includedInDeck' => false],
            ],
            'cards' => $rows,
        ];

        $key = strtolower(trim($commanderName));
        $this->searchIndex[$key][] = $deckId;
    }

    public function searchCommanderDecks(string $commanderName, int $pageSize): array
    {
        ++$this->searchCalls;
        $ids = $this->searchIndex[strtolower(trim($commanderName))] ?? [];

        $out = [];
        foreach (array_slice($ids, 0, max(1, $pageSize)) as $id) {
            $out[] = $this->summaries[$id];
        }

        // Popularity order, matching the real endpoint's `orderBy=-viewCount`.
        usort($out, static fn (array $a, array $b): int => $b['viewCount'] <=> $a['viewCount']);

        return $out;
    }

    public function fetchDeck(int $deckId): ?array
    {
        ++$this->deckCalls;

        return $this->details[$deckId] ?? null;
    }

    public function reset(): void
    {
        $this->searchIndex = [];
        $this->summaries = [];
        $this->details = [];
        $this->searchCalls = 0;
        $this->deckCalls = 0;
    }

    /**
     * @param list<string> $categories
     *
     * @return array<string, mixed>
     */
    private function cardRow(string $oracleId, int $quantity, array $categories): array
    {
        return [
            'quantity' => $quantity,
            'categories' => $categories,
            'card' => [
                'uid' => $oracleId,
                'oracleCard' => [
                    'uid' => $oracleId,
                    'defaultCategory' => $categories[0] ?? null,
                ],
            ],
        ];
    }
}
