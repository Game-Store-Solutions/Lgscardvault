<?php

namespace App\Service\Recommend\Intelligence;

/**
 * Everything the scoring engine knows about a commander/strategy scope, plus an
 * honest account of where it came from.
 *
 * Confidence and `fallbackLevel` travel with the data on purpose. A commander
 * with nine tagged reference decks and one with two must not present
 * identically, and callers (including the UI) need to be able to say so rather
 * than implying a two-deck sample is authoritative.
 */
final class CommanderIntelligence
{
    /** Exact commander + strategy match — the strongest signal. */
    public const LEVEL_COMMANDER_STRATEGY = 'commander_strategy';
    /** A neighbouring strategy for the same commander. */
    public const LEVEL_RELATED_STRATEGY = 'related_strategy';
    /** All of this commander's decks, strategy ignored. */
    public const LEVEL_COMMANDER_OVERALL = 'commander_overall';
    /** The archetype across every commander we hold data for. */
    public const LEVEL_STRATEGY_GLOBAL = 'strategy_global';
    /** No reference data at all — card metadata and theme tags only. */
    public const LEVEL_METADATA = 'metadata';

    /**
     * @param string $requestedStrategyId what the user picked
     * @param string $resolvedStrategyId  the scope we could actually serve
     * @param array<string, array{
     *   deckCount: int, sampleSize: int, inclusionRate: float,
     *   commanderAffinity: float, strategyAffinity: float,
     *   averageQuantity: float, baseScore: float, confidence: float,
     *   roleHint: ?string
     * }> $cardStats
     */
    public function __construct(
        public readonly string $requestedStrategyId,
        public readonly string $resolvedStrategyId,
        public readonly string $fallbackLevel,
        public readonly int $sampleSize,
        public readonly float $confidence,
        public readonly array $cardStats,
        public readonly SynergyEngine $synergy,
    ) {
    }

    public static function empty(string $requestedStrategyId): self
    {
        return new self(
            requestedStrategyId: $requestedStrategyId,
            resolvedStrategyId: $requestedStrategyId,
            fallbackLevel: self::LEVEL_METADATA,
            sampleSize: 0,
            confidence: 0.0,
            cardStats: [],
            synergy: new SynergyEngine(),
        );
    }

    public function hasReferenceData(): bool
    {
        return self::LEVEL_METADATA !== $this->fallbackLevel && [] !== $this->cardStats;
    }

    public function isExactMatch(): bool
    {
        return self::LEVEL_COMMANDER_STRATEGY === $this->fallbackLevel;
    }

    /**
     * @return array{
     *   deckCount: int, sampleSize: int, inclusionRate: float,
     *   commanderAffinity: float, strategyAffinity: float,
     *   averageQuantity: float, baseScore: float, confidence: float,
     *   roleHint: ?string
     * }|null
     */
    public function statFor(string $oracleId): ?array
    {
        return $this->cardStats[strtolower($oracleId)] ?? null;
    }

    /** @return list<string> oracle ids that appear in the reference sample */
    public function referencedOracleIds(): array
    {
        return array_keys($this->cardStats);
    }

    /** Human-readable provenance, safe to show in the UI. */
    public function provenanceLabel(): string
    {
        return match ($this->fallbackLevel) {
            self::LEVEL_COMMANDER_STRATEGY => sprintf('%d strategy-matched reference decks', $this->sampleSize),
            self::LEVEL_RELATED_STRATEGY => sprintf('%d decks from a related strategy', $this->sampleSize),
            self::LEVEL_COMMANDER_OVERALL => sprintf('%d reference decks for this commander', $this->sampleSize),
            self::LEVEL_STRATEGY_GLOBAL => 'general data for this strategy across commanders',
            default => 'card metadata only (no reference decks yet)',
        };
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'requestedStrategy' => $this->requestedStrategyId,
            'resolvedStrategy' => $this->resolvedStrategyId,
            'level' => $this->fallbackLevel,
            'sampleSize' => $this->sampleSize,
            'confidence' => round($this->confidence, 3),
            'exactMatch' => $this->isExactMatch(),
            'source' => $this->provenanceLabel(),
        ];
    }
}
