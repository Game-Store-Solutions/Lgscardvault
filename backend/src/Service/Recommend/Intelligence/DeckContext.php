<?php

namespace App\Service\Recommend\Intelligence;

/**
 * What the deck currently looks like and what it still needs.
 *
 * This is the state that makes recommendations move as the user edits: role
 * shortfalls, curve shape, and which package components are missing. Everything
 * here is derived from the user's own cards, so it is the only part of scoring
 * that must be recomputed when the deck changes.
 */
final class DeckContext
{
    /**
     * @param list<string>         $oracleIds     cards currently in the deck
     * @param array<string, int>   $roleCounts    role => cards filling it
     * @param array<string, int>   $roleTargets   role => target count for this strategy
     * @param array<string, int>   $packageCounts package component => cards filling it
     * @param array<string, int>   $packageTargets
     * @param array<int, int>      $curve         mana value bucket => count
     */
    public function __construct(
        public readonly array $oracleIds,
        public readonly array $roleCounts,
        public readonly array $roleTargets,
        public readonly array $packageCounts,
        public readonly array $packageTargets,
        public readonly array $curve,
        public readonly float $averageManaValue,
        public readonly int $nonLandCount,
    ) {
    }

    public static function empty(): self
    {
        return new self([], [], [], [], [], [], 0.0, 0);
    }

    public function isEmpty(): bool
    {
        return [] === $this->oracleIds;
    }

    public function size(): int
    {
        return count($this->oracleIds);
    }

    /**
     * Deck cards after which role need carries its full weight.
     *
     * On an empty deck every role is 100% unfilled, so "you need ramp" carries
     * no information — you need everything. Role need is a corrective signal
     * that only becomes discriminating once the deck has a shape, and letting it
     * run at full strength from card zero is what lets a generically useful
     * ramp piece outrank a strategy-defining card.
     */
    private const URGENCY_RAMP_UP = 20;

    /**
     * Floor on that scaling. A Commander deck always needs a mana base, so the
     * builder must feel some structural pull from its very first pick.
     */
    private const MIN_URGENCY = 0.25;

    /**
     * How badly the deck still needs a role, 0..1.
     *
     * 1.0 means nothing fills the role and the deck is far enough along for that
     * to be meaningful; 0.0 means the target is met. Roles with no target for
     * this strategy return 0 so a card is neither rewarded nor punished for
     * filling a slot the strategy does not track.
     */
    public function roleNeed(string $role): float
    {
        $target = $this->roleTargets[$role] ?? 0;
        if ($target < 1) {
            return 0.0;
        }
        $have = $this->roleCounts[$role] ?? 0;
        $shortfall = max(0.0, min(1.0, ($target - $have) / $target));

        return $shortfall * $this->urgency();
    }

    /**
     * Confidence that a role shortfall is informative, scaling with how much of
     * the deck has been decided.
     */
    public function urgency(): float
    {
        return max(self::MIN_URGENCY, min(1.0, $this->size() / self::URGENCY_RAMP_UP));
    }

    /**
     * Remaining need for a synergy-package component, 0..1.
     *
     * Feeds the package-completion bonus: a deck with ten token generators, four
     * doublers, and no payoffs should start valuing payoffs over yet another
     * generator.
     */
    public function packageNeed(string $component): float
    {
        $target = $this->packageTargets[$component] ?? 0;
        if ($target < 1) {
            return 0.0;
        }
        $have = $this->packageCounts[$component] ?? 0;

        return max(0.0, min(1.0, ($target - $have) / $target));
    }

    /**
     * Whether the package is far enough along that finishing it is worth a
     * bonus. Rewarding completion of a package nobody has started would just be
     * a disguised strategy bonus.
     */
    public function packageIsStarted(): bool
    {
        return array_sum($this->packageCounts) >= 3;
    }

    /** @return list<string> components that are started but under target */
    public function incompleteComponents(): array
    {
        $out = [];
        foreach ($this->packageTargets as $component => $target) {
            if ($target > 0 && ($this->packageCounts[$component] ?? 0) < $target) {
                $out[] = (string) $component;
            }
        }

        return $out;
    }

    /** @return list<string> roles that are under target, most urgent first */
    public function underfilledRoles(): array
    {
        $needs = [];
        foreach (array_keys($this->roleTargets) as $role) {
            $need = $this->roleNeed((string) $role);
            if ($need > 0.0) {
                $needs[(string) $role] = $need;
            }
        }
        arsort($needs);

        return array_keys($needs);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'size' => $this->size(),
            'nonLandCount' => $this->nonLandCount,
            'averageManaValue' => round($this->averageManaValue, 2),
            'roles' => $this->roleCounts,
            'roleTargets' => $this->roleTargets,
            'packages' => $this->packageCounts,
            'packageTargets' => $this->packageTargets,
            'curve' => $this->curve,
            'needs' => $this->underfilledRoles(),
        ];
    }
}
