<?php

namespace App\Service\Catalog;

/**
 * Searchable artist credits for a printing: the top-level Scryfall `artist`
 * plus each face's own credit (DFC / split / reversible).
 *
 * Stored lowercase so inventory artist filters can JSONB-containment match
 * instead of LOWER(CAST(scryfall_data AS TEXT)) LIKE — that sequential scan
 * of the raw payload is what made artist pages crawl.
 */
final class ArtistCredits
{
    /**
     * Unique, lowercase, trimmed artist names for this payload.
     *
     * @param array<string, mixed>|null $payload Scryfall-shaped card JSON
     *
     * @return list<string>
     */
    public static function collect(?string $artist, ?array $payload): array
    {
        $seen = [];
        self::add($seen, $artist);
        if (is_array($payload)) {
            self::add($seen, $payload['artist'] ?? null);
            $faces = $payload['card_faces'] ?? null;
            if (is_array($faces)) {
                foreach ($faces as $face) {
                    if (is_array($face)) {
                        self::add($seen, $face['artist'] ?? null);
                    }
                }
            }
        }

        return array_keys($seen);
    }

    /**
     * JSON scalar used with JSONB_CONTAINS(artistCredits, :param).
     * Null when the artist name is empty after trim.
     */
    public static function containsParam(string $artist): ?string
    {
        $needle = self::normalize($artist);
        if ('' === $needle) {
            return null;
        }

        return json_encode($needle, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public static function normalize(string $artist): string
    {
        return mb_strtolower(trim($artist));
    }

    /** @param array<string, true> $seen */
    private static function add(array &$seen, mixed $value): void
    {
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return;
        }

        $normalized = self::normalize((string) $value);
        if ('' === $normalized) {
            return;
        }

        $seen[$normalized] = true;
    }
}
