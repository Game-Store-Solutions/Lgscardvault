<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;

/**
 * Everything the intelligence pipeline needs to know about one oracle identity,
 * derived once and reused.
 *
 * Classification, candidate generation, scoring, and deck structure all read the
 * same card text. Tokenizing and lowercasing it per consumer showed up as the
 * dominant cost when analysing ten reference decks, so it happens once here.
 */
final class CardProfile
{
    /**
     * @param list<string> $tags           ThemeTokenizer tags
     * @param string       $haystack       lowercased type line + oracle text + keywords + name
     * @param list<string> $colorIdentity
     */
    public function __construct(
        public readonly string $oracleId,
        public readonly Card $card,
        public readonly string $name,
        public readonly array $tags,
        public readonly string $haystack,
        public readonly string $primaryType,
        public readonly ?float $cmc,
        public readonly array $colorIdentity,
        public readonly ?int $edhrecRank,
        public readonly bool $isLand,
        public readonly bool $isBasicLand,
        public readonly bool $isGameChanger,
    ) {
    }

    public function hasAnyTag(string ...$tags): bool
    {
        foreach ($tags as $tag) {
            if (in_array($tag, $this->tags, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Needles may be plain substrings or regular expressions. Patterns
     * containing `.*` or a backslash are treated as regex, matching the
     * convention StrategyCatalog already uses.
     *
     * @param list<string> $needles
     */
    public function matchesAnyNeedle(array $needles): bool
    {
        return null !== $this->firstMatchingNeedle($needles);
    }

    /** @param list<string> $needles */
    public function firstMatchingNeedle(array $needles): ?string
    {
        foreach ($needles as $needle) {
            $lower = strtolower($needle);
            if ('' === $lower) {
                continue;
            }
            if (str_contains($lower, '.*') || str_contains($lower, '\\')) {
                if (1 === @preg_match('/'.$lower.'/i', $this->haystack)) {
                    return $needle;
                }
                continue;
            }
            if (str_contains($this->haystack, $lower)) {
                return $needle;
            }
        }

        return null;
    }
}
