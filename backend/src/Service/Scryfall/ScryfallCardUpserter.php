<?php

namespace App\Service\Scryfall;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Platforms\PostgreSQLPlatform;

/**
 * Writes Scryfall card payloads into the `cards` table with native
 * `INSERT ... ON CONFLICT (id) DO UPDATE` statements.
 *
 * Why not the ORM path (find → new/setters → flush)?
 *  - Concurrency: two messenger workers importing overlapping cards would
 *    both miss on find(), both persist the same UUID, and the loser's
 *    flush() blows up with a unique violation that fails the whole batch.
 *    ON CONFLICT makes the write atomic and last-writer-wins.
 *  - Throughput/memory: the bulk sync upserts hundreds of thousands of
 *    rows; skipping entity hydration and the unit of work keeps memory
 *    flat and lets us multi-row batch the inserts.
 *
 * `RETURNING (xmax = 0)` distinguishes inserts from updates (a freshly
 * inserted row has xmax 0 in the inserting transaction).
 */
final class ScryfallCardUpserter
{
    private const COLUMNS = [
        'id', 'oracle_id', 'name', 'set_code', 'collector_number', 'rarity',
        'edhrec_rank', 'mana_cost', 'type_line', 'oracle_text', 'cmc', 'image_uris', 'prices',
        'set_name', 'colors', 'color_identity', 'keywords', 'power', 'toughness',
        'loyalty', 'artist', 'flavor_text', 'legalities', 'finishes', 'games',
        'released_at', 'lang', 'layout', 'scryfall_uri', 'scryfall_data',
        'scryfall_updated_at',
    ];

    public function __construct(private readonly Connection $connection)
    {
    }

    /**
     * Upsert a single Scryfall card payload. Returns 'inserted', 'updated',
     * or 'skipped' (payload missing the identity fields).
     *
     * @param array<string, mixed> $data
     */
    public function upsertOne(array $data): string
    {
        $result = $this->upsertMany([$data]);
        if (1 === $result['inserted']) {
            return 'inserted';
        }

        return 1 === $result['updated'] ? 'updated' : 'skipped';
    }

    /**
     * Upsert a batch of Scryfall card payloads in a single multi-row
     * statement. Payloads missing id/oracle_id/name are skipped; duplicate
     * ids within the batch keep the last occurrence (ON CONFLICT cannot
     * touch the same row twice in one statement).
     *
     * @param list<array<string, mixed>> $cards
     *
     * @return array{inserted: int, updated: int, skipped: int}
     */
    public function upsertMany(array $cards): array
    {
        $this->assertPostgres();

        $rows = [];
        $skipped = 0;
        foreach ($cards as $data) {
            if (!is_array($data) || !isset($data['id'], $data['oracle_id'], $data['name'])) {
                ++$skipped;
                continue;
            }

            // Last occurrence wins so a duplicate id can't appear twice in one statement.
            $rows[strtolower((string) $data['id'])] = $this->mapRow($data);
        }

        if ([] === $rows) {
            return ['inserted' => 0, 'updated' => 0, 'skipped' => $skipped];
        }

        // Deterministic id order: concurrent multi-row upserts over an
        // overlapping id set must acquire their row locks in the SAME order,
        // or Postgres deadlocks (40P01) — e.g. the bulk sync racing an
        // import worker's collection batch on popular cards.
        ksort($rows, SORT_STRING);

        $columnCount = count(self::COLUMNS);
        $placeholderRow = '('.implode(', ', array_fill(0, $columnCount, '?')).')';
        $placeholders = implode(', ', array_fill(0, count($rows), $placeholderRow));

        $updates = [];
        foreach (self::COLUMNS as $column) {
            if ('id' === $column) {
                continue;
            }
            $updates[] = sprintf('%1$s = EXCLUDED.%1$s', $column);
        }

        $sql = sprintf(
            'INSERT INTO cards (%s) VALUES %s ON CONFLICT (id) DO UPDATE SET %s RETURNING (xmax = 0) AS inserted',
            implode(', ', self::COLUMNS),
            $placeholders,
            implode(', ', $updates),
        );

        $params = [];
        foreach ($rows as $row) {
            foreach ($row as $value) {
                $params[] = $value;
            }
        }

        $inserted = 0;
        $updated = 0;
        foreach ($this->connection->executeQuery($sql, $params)->fetchFirstColumn() as $wasInsert) {
            // Drivers may hand back native bools or 't'/'f' strings.
            if (true === $wasInsert || 't' === $wasInsert || '1' === $wasInsert || 1 === $wasInsert) {
                ++$inserted;
            } else {
                ++$updated;
            }
        }

        return ['inserted' => $inserted, 'updated' => $updated, 'skipped' => $skipped];
    }

    /**
     * Maps a raw Scryfall payload onto the cards table columns, mirroring
     * the truncation/typing rules the ORM entity setters used.
     *
     * @param array<string, mixed> $data
     *
     * @return list<mixed> values ordered like self::COLUMNS
     */
    private function mapRow(array $data): array
    {
        return [
            strtolower((string) $data['id']),
            strtolower((string) $data['oracle_id']),
            $this->truncate((string) $data['name'], 255),
            $this->truncate((string) ($data['set'] ?? ''), 10),
            $this->truncate((string) ($data['collector_number'] ?? ''), 20),
            isset($data['rarity']) ? $this->truncate((string) $data['rarity'], 20) : null,
            isset($data['edhrec_rank']) && is_numeric($data['edhrec_rank']) ? (int) $data['edhrec_rank'] : null,
            isset($data['mana_cost']) ? $this->truncate((string) $data['mana_cost'], 64) : null,
            isset($data['type_line']) ? $this->truncate((string) $data['type_line'], 255) : null,
            isset($data['oracle_text']) ? (string) $data['oracle_text'] : null,
            isset($data['cmc']) ? (float) $data['cmc'] : null,
            $this->encodeJson($data['image_uris'] ?? null),
            $this->encodeJson($data['prices'] ?? null),
            isset($data['set_name']) ? $this->truncate((string) $data['set_name'], 255) : null,
            $this->encodeJsonList($data['colors'] ?? null),
            $this->encodeJsonList($data['color_identity'] ?? null),
            $this->encodeJsonList($data['keywords'] ?? null),
            isset($data['power']) ? $this->truncate((string) $data['power'], 16) : null,
            isset($data['toughness']) ? $this->truncate((string) $data['toughness'], 16) : null,
            isset($data['loyalty']) ? $this->truncate((string) $data['loyalty'], 16) : null,
            isset($data['artist']) ? $this->truncate((string) $data['artist'], 255) : null,
            isset($data['flavor_text']) ? (string) $data['flavor_text'] : null,
            $this->encodeJson($data['legalities'] ?? null),
            $this->encodeJsonList($data['finishes'] ?? null),
            $this->encodeJsonList($data['games'] ?? null),
            $this->parseDate($data['released_at'] ?? null)?->format('Y-m-d'),
            isset($data['lang']) ? $this->truncate((string) $data['lang'], 16) : null,
            isset($data['layout']) ? $this->truncate((string) $data['layout'], 32) : null,
            isset($data['scryfall_uri']) ? $this->truncate((string) $data['scryfall_uri'], 512) : null,
            $this->encodeJson($data),
            $this->parseDate($data['updated_at'] ?? null)?->format('Y-m-d H:i:s'),
        ];
    }

    private function assertPostgres(): void
    {
        if (!$this->connection->getDatabasePlatform() instanceof PostgreSQLPlatform) {
            throw new \RuntimeException('ScryfallCardUpserter requires PostgreSQL (INSERT ... ON CONFLICT).');
        }
    }

    private function encodeJson(mixed $value): ?string
    {
        if (!is_array($value)) {
            return null;
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    private function encodeJsonList(mixed $value): ?string
    {
        if (!is_array($value)) {
            return null;
        }

        return json_encode(array_values($value), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    private function parseDate(mixed $value): ?\DateTimeImmutable
    {
        if (!is_string($value) || '' === $value) {
            return null;
        }

        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            return null;
        }
    }

    /**
     * Truncates to a column's character limit. Uses mb_* so a multibyte
     * sequence is never sliced in half — a byte-wise substr() on a long
     * unicode name yields invalid UTF-8 that PostgreSQL rejects outright
     * (VARCHAR(n) counts characters, not bytes).
     */
    private function truncate(string $value, int $maxLength): string
    {
        return mb_strlen($value) > $maxLength ? mb_substr($value, 0, $maxLength) : $value;
    }
}
