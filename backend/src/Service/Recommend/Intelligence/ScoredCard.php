<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\InventoryItem;

/**
 * One scored recommendation, carrying the breakdown that produced it.
 *
 * Explanations are recorded while each term is computed, never reconstructed
 * afterwards. That matters for more than honesty: a post-hoc explanation cannot
 * be wrong in a way anyone notices, so it hides scoring bugs. Here the reasons
 * are the scoring trace, so if the text looks wrong the score is wrong.
 */
final class ScoredCard
{
    /**
     * @param array<string, float> $components       weight key => normalized 0..1 contribution
     * @param list<string>         $reasons          human-readable, strongest contributor first
     * @param list<string>         $signals          raw matched tags/needles behind those reasons
     * @param list<string>         $roles            structural deck roles filled (ramp, draw, ...)
     * @param list<string>         $packageComponents synergy-package components supplied
     * @param list<string>         $strategyRoles    strategy-package roles (enabler/fuel/payoff/support)
     */
    public function __construct(
        public readonly CardProfile $profile,
        public readonly float $score,
        public readonly array $components,
        public readonly array $reasons,
        public readonly array $signals,
        public readonly array $roles,
        public readonly array $packageComponents,
        public readonly string $primaryRole,
        public readonly string $strategyRole,
        public readonly array $strategyRoles,
        public readonly ?InventoryItem $inventoryItem,
        public readonly int $stockQuantity,
        public readonly ?int $priceCents,
        public readonly float $confidence,
    ) {
    }

    public function cardType(): string
    {
        return $this->profile->primaryType;
    }

    public function oracleId(): string
    {
        return $this->profile->oracleId;
    }

    public function isInStock(): bool
    {
        return $this->stockQuantity > 0;
    }

    /**
     * The single largest contributor, for compact UI labels.
     */
    public function topComponent(): ?string
    {
        if ([] === $this->components) {
            return null;
        }
        $sorted = $this->components;
        arsort($sorted);

        return (string) array_key_first($sorted);
    }
}
