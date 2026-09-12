<?php

namespace App\Service\Catalog;

use App\Entity\Card;
use App\Entity\Game;

/**
 * Name search on the catalog used to dump substring hits in A–Z order, so
 * "bolt" could list Bolt Bend before Lightning Bolt and "sol" could bury
 * Sol Ring under Consolation. Callers rank after the SQL merge (local +
 * folded + remote) so every screen that reads /catalog/search gets the
 * same relevance order.
 */
final class CatalogSearchRanker
{
    /**
     * @param list<Card> $cards
     *
     * @return list<Card>
     */
    public function rank(array $cards, string $query): array
    {
        $foldedQuery = $this->foldPhrase($query);
        if ('' === $foldedQuery || [] === $cards) {
            return array_values($cards);
        }

        $rows = [];
        foreach ($cards as $index => $card) {
            $rows[] = [$this->score($card, $foldedQuery), $index, $card];
        }

        usort($rows, static function (array $left, array $right): int {
            return $left[0] <=> $right[0] ?: $left[1] <=> $right[1];
        });

        return array_map(static fn (array $row): Card => $row[2], $rows);
    }

    /**
     * One row per oracle identity (Magic) or TCGPlayer base name (other games),
     * keeping the first — callers must rank first so that row is the
     * best-matching printing of that card.
     *
     * @param list<Card> $cards
     *
     * @return list<Card>
     */
    public function uniqueCards(array $cards): array
    {
        $seen = [];
        $out = [];
        foreach ($cards as $card) {
            $key = $this->uniqueKey($card);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $card;
        }

        return $out;
    }

    /**
     * Comparable tuple: match tier, popularity, length, name.
     *
     * Name-prefix beats a later word ("Sol Ring" over "Ashaya, Soul of the
     * Wild" for "so"). Popularity only breaks ties inside a tier so a famous
     * commander named "… Soul …" cannot bury every So- card.
     *
     * @return array{0: int, 1: int, 2: int, 3: string}
     */
    private function score(Card $card, string $foldedQuery): array
    {
        $foldedName = $this->foldPhrase($card->getName());
        $tier = 4;
        if ($foldedName === $foldedQuery) {
            $tier = 0;
        } elseif (str_starts_with($foldedName, $foldedQuery)) {
            $tier = 1;
        } elseif ($this->tokenPrefixMatch($foldedName, $foldedQuery)) {
            $tier = 2;
        } elseif (str_contains($foldedName, $foldedQuery) || $this->queryTokensMatch($foldedName, $foldedQuery, true)) {
            $tier = 3;
        }

        return [
            $tier,
            $this->popularity($card),
            mb_strlen($foldedName),
            $foldedName,
        ];
    }

    /**
     * Lower is better. EDHREC rank for Magic; for every other game a priced
     * card outranks an unpriced one, then higher market price stands in for
     * popularity so Charizard beats a 2-cent cousin of the same prefix.
     */
    private function popularity(Card $card): int
    {
        $edhrec = $card->getEdhrecRank();
        if (null !== $edhrec) {
            return $edhrec;
        }

        $usd = $this->usdCents($card);
        if (null === $usd) {
            return 1_000_000;
        }

        return max(0, 500_000 - $usd);
    }

    private function usdCents(Card $card): ?int
    {
        $prices = $card->getPrices() ?? [];
        foreach (['usd', 'usd_foil', 'usd_etched'] as $key) {
            $raw = $prices[$key] ?? null;
            if (is_numeric($raw)) {
                return (int) round(((float) $raw) * 100);
            }
        }

        return null;
    }

    private function tokenPrefixMatch(string $foldedName, string $foldedQuery): bool
    {
        if (str_starts_with($foldedName, $foldedQuery)) {
            return true;
        }

        return $this->queryTokensMatch($foldedName, $foldedQuery, false);
    }

    /**
     * Every query token hits a name token in order. Prefix matches are exact
     * enough for "sol ri" → Sol Ring; fuzzy allows one edit on 4+ letter tokens
     * so "sol rng" still ranks.
     */
    private function queryTokensMatch(string $foldedName, string $foldedQuery, bool $allowFuzzy): bool
    {
        $queryTokens = $this->tokens($foldedQuery);
        $nameTokens = $this->tokens($foldedName);
        if ([] === $queryTokens || [] === $nameTokens) {
            return false;
        }

        $queryCount = \count($queryTokens);
        $offset = 0;
        foreach ($queryTokens as $queryToken) {
            $found = false;
            for ($i = $offset, $n = \count($nameTokens); $i < $n; ++$i) {
                if ($this->tokenHits($nameTokens[$i], $queryToken, $allowFuzzy, $queryCount)) {
                    $offset = $i + 1;
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                return false;
            }
        }

        return true;
    }

    private function tokenHits(string $nameToken, string $queryToken, bool $allowFuzzy, int $queryTokenCount): bool
    {
        if (str_starts_with($nameToken, $queryToken)) {
            return true;
        }
        // One-token "sol" is too weak for edits. Multi-word queries may slip a
        // letter ("sol rng") on a 3+ letter token.
        $minLen = $queryTokenCount >= 2 ? 3 : 4;
        if (!$allowFuzzy || mb_strlen($queryToken) < $minLen) {
            return false;
        }
        if (abs(mb_strlen($nameToken) - mb_strlen($queryToken)) > 2) {
            return false;
        }

        return levenshtein($nameToken, $queryToken) <= 1;
    }

    /**
     * @return list<string>
     */
    private function tokens(string $folded): array
    {
        return preg_split('/[^\p{L}\p{N}]+/u', $folded, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }

    private function foldPhrase(string $text): string
    {
        $folded = SearchTextNormalizer::fold($text);

        return trim(preg_replace('/\s+/u', ' ', $folded) ?? $folded);
    }

    private function uniqueKey(Card $card): string
    {
        if (Game::CODE_MTG === $card->resolvedGameCode()) {
            $oracleId = $card->getOracleId();
            if (null !== $oracleId) {
                return 'oracle:'.strtolower((string) $oracleId);
            }
        }

        return 'name:'.$card->resolvedGameCode().':'.CardNameIdentity::fold(CardNameIdentity::baseName($card->getName()));
    }
}
