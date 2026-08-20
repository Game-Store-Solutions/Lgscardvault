<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\InventoryItem;

/**
 * A candidate with everything that does *not* depend on the current deck already
 * computed.
 *
 * The split matters for the auto-builder: it picks ninety-nine cards, and each
 * pick changes role need, package completion, curve, and existing-deck synergy
 * for every remaining candidate. Re-running the whole model per pick would mean
 * re-classifying hundreds of cards against dozens of regexes thousands of times.
 *
 * Everything static — reference affinities, role classification, package
 * membership, popularity, stock — is computed once here. Only the deck-dependent
 * terms are recomputed between picks, which is cheap set arithmetic.
 */
final class PreparedCandidate
{
    /**
     * @param array{
     *   deckCount: int, sampleSize: int, inclusionRate: float,
     *   commanderAffinity: float, strategyAffinity: float,
     *   averageQuantity: float, baseScore: float, confidence: float,
     *   roleHint: ?string
     * }|null $stat
     * @param array<string, float> $staticComponents
     * @param list<string>         $staticReasons
     * @param list<string>         $signals
     * @param list<string>         $roles
     * @param list<string>         $packageComponents
     * @param list<string>         $strategyRoles
     */
    public function __construct(
        public readonly CardProfile $profile,
        public readonly ?array $stat,
        public readonly array $staticComponents,
        public readonly array $staticReasons,
        public readonly array $signals,
        public readonly array $roles,
        public readonly array $packageComponents,
        public readonly string $strategyRole,
        public readonly array $strategyRoles,
        public readonly ?InventoryItem $inventoryItem,
        public readonly int $stockQuantity,
        public readonly ?int $priceCents,
        public readonly float $confidence,
    ) {
    }

    public function oracleId(): string
    {
        return $this->profile->oracleId;
    }

    public function isInStock(): bool
    {
        return $this->stockQuantity > 0;
    }

    public function hasRole(string $role): bool
    {
        return in_array($role, $this->roles, true);
    }

    public function hasComponent(string $component): bool
    {
        return in_array($component, $this->packageComponents, true);
    }
}
