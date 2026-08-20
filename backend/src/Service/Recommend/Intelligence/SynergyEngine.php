<?php

namespace App\Service\Recommend\Intelligence;

/**
 * Card-to-card relationships derived from reference deck co-occurrence.
 *
 * The core problem this solves is telling *strategic synergy* apart from
 * *popularity correlation*. Raw co-occurrence cannot: Sol Ring appears alongside
 * every card in every deck, so counting pairs would rank it as everything's best
 * friend. Lift fixes that by asking whether two cards appear together more often
 * than their individual play rates predict:
 *
 *     lift(A,B) = P(A and B) / (P(A) * P(B))
 *
 * Two independently popular cards land at lift ≈ 1.0 and earn nothing. Cards
 * that genuinely travel together — a token doubler and a token generator — land
 * well above 1.0. The result is then damped by how many decks actually support
 * the observation, so a two-of-three coincidence never outranks an eight-of-ten
 * pattern.
 *
 * Constructed per scope from the membership matrix (~10 decks, ~1,000 ids) and
 * queried in memory, which is why no card-pair table exists: materialising pairs
 * would be O(n²) per deck and would need re-truncating whenever thresholds move.
 */
final class SynergyEngine
{
    /** Lift at which a relationship is considered maximally strong. */
    private const LIFT_SATURATION = 2.0;

    /** A pair seen in fewer decks than this is treated as coincidence. */
    private const MIN_SUPPORT = 2;

    /** @var list<array<string, true>> one membership set per deck */
    private array $decks = [];

    /** @var array<string, int> oracle id => decks containing it */
    private array $cardCounts = [];

    private int $sampleSize = 0;

    /**
     * @param list<list<string>> $membershipMatrix one list of oracle ids per deck
     */
    public function __construct(array $membershipMatrix = [])
    {
        foreach ($membershipMatrix as $oracleIds) {
            $set = [];
            foreach ($oracleIds as $oracleId) {
                $key = strtolower(trim((string) $oracleId));
                if ('' !== $key) {
                    $set[$key] = true;
                }
            }
            if ([] === $set) {
                continue;
            }
            $this->decks[] = $set;
            foreach (array_keys($set) as $key) {
                $this->cardCounts[$key] = ($this->cardCounts[$key] ?? 0) + 1;
            }
        }

        $this->sampleSize = count($this->decks);
    }

    public function sampleSize(): int
    {
        return $this->sampleSize;
    }

    public function hasData(): bool
    {
        return $this->sampleSize > 0;
    }

    /** Share of reference decks playing a card. */
    public function inclusionRate(string $oracleId): float
    {
        if ($this->sampleSize < 1) {
            return 0.0;
        }

        return ($this->cardCounts[strtolower($oracleId)] ?? 0) / $this->sampleSize;
    }

    /**
     * Strength of the relationship between two cards, 0..1.
     *
     * Returns 0 when the pair lacks support or when co-occurrence is no better
     * than chance — both of which mean "these two are not connected", not "we
     * are unsure".
     */
    public function relationshipStrength(string $oracleA, string $oracleB): float
    {
        $a = strtolower($oracleA);
        $b = strtolower($oracleB);
        if ($a === $b || $this->sampleSize < 1) {
            return 0.0;
        }

        $support = $this->coOccurrenceCount($a, $b);
        if ($support < self::MIN_SUPPORT) {
            return 0.0;
        }

        $rateA = $this->inclusionRate($a);
        $rateB = $this->inclusionRate($b);
        if ($rateA <= 0.0 || $rateB <= 0.0) {
            return 0.0;
        }

        $jointRate = $support / $this->sampleSize;
        $lift = $jointRate / ($rateA * $rateB);
        if ($lift <= 1.0) {
            return 0.0;
        }

        $liftScore = min(1.0, ($lift - 1.0) / (self::LIFT_SATURATION - 1.0));
        // Support share keeps a 2-of-3 fluke below an 8-of-10 pattern.
        $supportScore = $support / $this->sampleSize;

        return max(0.0, min(1.0, $liftScore * $supportScore));
    }

    public function coOccurrenceCount(string $oracleA, string $oracleB): int
    {
        $a = strtolower($oracleA);
        $b = strtolower($oracleB);
        $count = 0;
        foreach ($this->decks as $deck) {
            if (isset($deck[$a], $deck[$b])) {
                ++$count;
            }
        }

        return $count;
    }

    /**
     * How well a candidate fits the cards already in the deck.
     *
     * Returns the mean of its strongest relationships rather than a plain
     * average over the whole deck: a card that reinforces seven of the user's
     * picks should not be penalised for ignoring the other fifty. This is the
     * Level 3 signal — "given what is already here, what is the best next card".
     *
     * @param list<string> $deckOracleIds
     *
     * @return array{score: float, partners: list<array{oracleId: string, strength: float, coOccurrence: int}>}
     */
    public function synergyWithDeck(string $candidateOracleId, array $deckOracleIds, int $topPartners = 8): array
    {
        if ($this->sampleSize < 1 || [] === $deckOracleIds) {
            return ['score' => 0.0, 'partners' => []];
        }

        $candidate = strtolower($candidateOracleId);
        $partners = [];
        foreach ($deckOracleIds as $oracleId) {
            $other = strtolower((string) $oracleId);
            if ($other === $candidate) {
                continue;
            }
            $strength = $this->relationshipStrength($candidate, $other);
            if ($strength <= 0.0) {
                continue;
            }
            $partners[] = [
                'oracleId' => $other,
                'strength' => round($strength, 4),
                'coOccurrence' => $this->coOccurrenceCount($candidate, $other),
            ];
        }

        if ([] === $partners) {
            return ['score' => 0.0, 'partners' => []];
        }

        usort($partners, static fn (array $x, array $y): int => $y['strength'] <=> $x['strength']);
        $top = array_slice($partners, 0, max(1, $topPartners));

        // Mean of the top partners, scaled by how many of them there are, so
        // breadth of connection matters as well as depth. A card connected to
        // one deck card strongly still scores below one connected to seven.
        $mean = array_sum(array_column($top, 'strength')) / count($top);
        $breadth = min(1.0, count($top) / max(1, $topPartners));

        return [
            'score' => round(max(0.0, min(1.0, $mean * (0.5 + (0.5 * $breadth)))), 4),
            'partners' => $top,
        ];
    }

    /**
     * Cards most connected to a seed card, for surfacing packages and for
     * candidate generation.
     *
     * @return list<array{oracleId: string, strength: float, coOccurrence: int}>
     */
    public function strongestPartners(string $oracleId, int $limit = 20): array
    {
        $seed = strtolower($oracleId);
        $out = [];
        foreach (array_keys($this->cardCounts) as $other) {
            if ($other === $seed) {
                continue;
            }
            $strength = $this->relationshipStrength($seed, $other);
            if ($strength > 0.0) {
                $out[] = [
                    'oracleId' => $other,
                    'strength' => round($strength, 4),
                    'coOccurrence' => $this->coOccurrenceCount($seed, $other),
                ];
            }
        }

        usort($out, static fn (array $a, array $b): int => $b['strength'] <=> $a['strength']);

        return array_slice($out, 0, max(1, $limit));
    }

    /** @return list<string> every oracle id seen in the reference sample */
    public function knownOracleIds(): array
    {
        return array_keys($this->cardCounts);
    }
}
