<?php

namespace App\Service\Recommend\Provider;

/**
 * Provider-agnostic reference decklist.
 *
 * Every DeckDataProvider normalizes into this shape, so nothing downstream
 * (classification, aggregation, scoring) knows or cares which community site
 * a list came from. Cards are keyed by Scryfall oracle id — the same identity
 * our `cards.oracle_id` column uses — so joins never fall back to name
 * matching.
 */
final class ReferenceDeckPayload
{
    /**
     * @param string                $provider          provider name, e.g. "archidekt"
     * @param string                $externalId        stable id within that provider
     * @param list<string>          $commanderOracleIds one entry normally, two for partners/backgrounds
     * @param array<string, int>    $cards             oracle id => quantity (mainboard, commander excluded)
     * @param list<string>          $providerTags      raw strategy tags as the provider spelled them
     * @param array<string, string> $roleHints         oracle id => provider role/category hint
     */
    public function __construct(
        public readonly string $provider,
        public readonly string $externalId,
        public readonly string $name,
        public readonly array $commanderOracleIds,
        public readonly array $cards,
        public readonly array $providerTags = [],
        public readonly array $roleHints = [],
        public readonly float $popularity = 0.0,
        public readonly ?int $bracket = null,
        public readonly ?\DateTimeImmutable $updatedAt = null,
        public readonly ?string $url = null,
    ) {
    }

    public function cardCount(): int
    {
        return array_sum($this->cards);
    }

    public function hasCommander(string $oracleId): bool
    {
        return in_array($oracleId, $this->commanderOracleIds, true);
    }

    /**
     * A usable Commander reference deck: a single commander (or a legal
     * partner pair) and roughly a full 100. Providers happily return
     * 40-card stubs and "all my commanders" binder lists; neither tells us
     * anything about how a real deck is built.
     */
    public function looksLikeCommanderDeck(): bool
    {
        $commanders = count($this->commanderOracleIds);
        if ($commanders < 1 || $commanders > 2) {
            return false;
        }
        $total = $this->cardCount() + $commanders;

        return $total >= 90 && $total <= 110;
    }

    /** @return list<string> */
    public function oracleIds(): array
    {
        return array_keys($this->cards);
    }
}
