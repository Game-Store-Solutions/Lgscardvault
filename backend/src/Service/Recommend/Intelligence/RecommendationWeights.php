<?php

namespace App\Service\Recommend\Intelligence;

/**
 * Configurable scoring weights for the recommendation engine.
 *
 * Bound from `commander_intelligence.weights` (config/packages/commander_intelligence.yaml)
 * so the model can be re-balanced without editing service code. Unknown keys
 * are rejected loudly rather than silently ignored, which turns a typo in the
 * config into a boot failure instead of a subtly wrong ranking.
 */
final class RecommendationWeights
{
    public const STRATEGY_AFFINITY = 'strategy_affinity';
    public const EXISTING_DECK_SYNERGY = 'existing_deck_synergy';
    public const ROLE_NEED = 'role_need';
    public const RELATIONSHIP = 'relationship';
    public const REFERENCE_FREQUENCY = 'reference_frequency';
    public const PACKAGE_COMPLETION = 'package_completion';
    public const COMMANDER_AFFINITY = 'commander_affinity';
    public const MANA_CURVE = 'mana_curve';
    public const POPULARITY = 'popularity';

    /** Ordered so explanations list the heaviest contributors first. */
    public const ALL = [
        self::STRATEGY_AFFINITY,
        self::EXISTING_DECK_SYNERGY,
        self::ROLE_NEED,
        self::RELATIONSHIP,
        self::REFERENCE_FREQUENCY,
        self::PACKAGE_COMPLETION,
        self::COMMANDER_AFFINITY,
        self::MANA_CURVE,
        self::POPULARITY,
    ];

    private const DEFAULTS = [
        self::STRATEGY_AFFINITY => 0.26,
        self::EXISTING_DECK_SYNERGY => 0.16,
        self::ROLE_NEED => 0.14,
        self::RELATIONSHIP => 0.12,
        self::REFERENCE_FREQUENCY => 0.10,
        self::PACKAGE_COMPLETION => 0.08,
        self::COMMANDER_AFFINITY => 0.07,
        self::MANA_CURVE => 0.04,
        self::POPULARITY => 0.03,
    ];

    /** @var array<string, float> */
    private readonly array $weights;

    private readonly float $stockBonus;

    /**
     * @param array<string, int|float|string> $weights
     */
    public function __construct(array $weights = [], float $stockBonus = 0.03)
    {
        $unknown = array_diff(array_keys($weights), self::ALL);
        if ([] !== $unknown) {
            throw new \InvalidArgumentException(sprintf(
                'Unknown recommendation weight(s): %s. Known weights: %s.',
                implode(', ', $unknown),
                implode(', ', self::ALL),
            ));
        }

        $resolved = [];
        foreach (self::ALL as $key) {
            $resolved[$key] = max(0.0, (float) ($weights[$key] ?? self::DEFAULTS[$key]));
        }

        $this->weights = $resolved;
        $this->stockBonus = max(0.0, $stockBonus);
    }

    public function get(string $key): float
    {
        return $this->weights[$key] ?? 0.0;
    }

    public function stockBonus(): float
    {
        return $this->stockBonus;
    }

    /**
     * Total of all weights. Scores are divided by this so the final value is
     * always 0..1 regardless of how the config is tuned — otherwise raising
     * one weight would silently inflate every score.
     */
    public function total(): float
    {
        $total = array_sum($this->weights);

        return $total > 0.0 ? $total : 1.0;
    }

    /** @return array<string, float> */
    public function toArray(): array
    {
        return $this->weights;
    }
}
