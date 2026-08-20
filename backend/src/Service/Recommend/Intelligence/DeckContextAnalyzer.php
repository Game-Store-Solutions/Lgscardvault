<?php

namespace App\Service\Recommend\Intelligence;

/**
 * Builds a DeckContext from the cards currently in a deck, and classifies a
 * single card's structural roles and package components.
 *
 * Cards deliberately satisfy several roles at once: a mana rock in an artifact
 * deck is ramp *and* strategy density, a Sakura-Tribe Elder in a landfall deck is
 * ramp *and* an enabler. Forcing one role per card is what makes rule-based
 * builders produce incoherent decks, so nothing here is exclusive.
 */
final class DeckContextAnalyzer
{
    public const ROLE_LANDS = 'lands';
    public const ROLE_RAMP = 'ramp';
    public const ROLE_DRAW = 'draw';
    public const ROLE_REMOVAL = 'removal';
    public const ROLE_BOARD_WIPE = 'board_wipe';
    public const ROLE_PROTECTION = 'protection';
    public const ROLE_FINISHER = 'finisher';

    /**
     * Oracle-text signals per structural role. Deliberately narrow: broad
     * needles ("add") match half the format and would make every role look
     * filled.
     *
     * @var array<string, array{tags: list<string>, needles: list<string>}>
     */
    private const ROLE_SIGNALS = [
        self::ROLE_RAMP => [
            'tags' => ['ramp', 'dork', 'treasure'],
            'needles' => ['\\{t\\}: add', 'search your library for a basic', 'search your library for a land', 'create a treasure', 'play an additional land'],
        ],
        self::ROLE_DRAW => [
            'tags' => ['draw'],
            'needles' => ['draw a card', 'draw two cards', 'draw three cards', 'draws a card'],
        ],
        self::ROLE_REMOVAL => [
            'tags' => ['removal'],
            'needles' => ['destroy target', 'exile target', 'counter target', 'fight target', 'deals damage equal to'],
        ],
        self::ROLE_BOARD_WIPE => [
            'tags' => ['board_wipe'],
            'needles' => ['destroy all', 'exile all', 'each player sacrifices', 'all creatures get -'],
        ],
        self::ROLE_PROTECTION => [
            'tags' => [],
            'needles' => ['hexproof', 'indestructible', 'protection from', 'shroud', 'ward', 'phasing', 'counter target spell'],
        ],
        self::ROLE_FINISHER => [
            'tags' => [],
            'needles' => ['win the game', 'each opponent loses', 'double the', 'additional combat phase', 'extra turn', 'infinite'],
        ],
    ];

    public function __construct(
        private readonly StrategyTaxonomy $taxonomy,
        private readonly CardProfileIndex $profiles,
    ) {
    }

    /**
     * @param list<string> $oracleIds cards currently in the deck, repeated for
     *                                multiple copies (basic lands), so role and
     *                                curve counts reflect the real deck rather
     *                                than its distinct card names
     */
    public function analyze(array $oracleIds, string $strategyId): DeckContext
    {
        $roleTargets = $this->taxonomy->structure($strategyId);
        $packageTargets = $this->packageTargets($strategyId);

        if ([] === $oracleIds) {
            return new DeckContext([], [], $roleTargets, [], $packageTargets, [], 0.0, 0);
        }

        $this->profiles->preload($oracleIds);

        $roleCounts = array_fill_keys(array_keys($roleTargets), 0);
        $packageCounts = array_fill_keys(array_keys($packageTargets), 0);
        $curve = [];
        $manaTotal = 0.0;
        $nonLand = 0;

        foreach ($oracleIds as $oracleId) {
            $profile = $this->profiles->get((string) $oracleId);
            if (null === $profile) {
                continue;
            }
            foreach ($this->rolesFor($profile) as $role) {
                $roleCounts[$role] = ($roleCounts[$role] ?? 0) + 1;
            }
            foreach ($this->componentsFor($profile, $strategyId) as $component) {
                $packageCounts[$component] = ($packageCounts[$component] ?? 0) + 1;
            }

            if ($profile->isLand) {
                continue;
            }
            ++$nonLand;
            $cmc = (int) round($profile->cmc ?? 0.0);
            $bucket = min(7, max(0, $cmc));
            $curve[$bucket] = ($curve[$bucket] ?? 0) + 1;
            $manaTotal += $profile->cmc ?? 0.0;
        }

        ksort($curve);

        return new DeckContext(
            oracleIds: array_values(array_map('strtolower', $oracleIds)),
            roleCounts: $roleCounts,
            roleTargets: $roleTargets,
            packageCounts: $packageCounts,
            packageTargets: $packageTargets,
            curve: $curve,
            averageManaValue: $nonLand > 0 ? $manaTotal / $nonLand : 0.0,
            nonLandCount: $nonLand,
        );
    }

    /**
     * Structural roles a card fills. Multiple roles are normal and intended.
     *
     * @return list<string>
     */
    public function rolesFor(CardProfile $profile): array
    {
        $roles = [];

        if ($profile->isLand) {
            $roles[] = self::ROLE_LANDS;
            // Utility lands still count for what they do, but a basic land is
            // only ever a land.
            if ($profile->isBasicLand) {
                return $roles;
            }
        }

        foreach (self::ROLE_SIGNALS as $role => $signals) {
            if ($profile->hasAnyTag(...$signals['tags']) || $profile->matchesAnyNeedle($signals['needles'])) {
                $roles[] = $role;
            }
        }

        return array_values(array_unique($roles));
    }

    /**
     * Which components of the strategy's synergy package a card supplies.
     *
     * @return list<string>
     */
    public function componentsFor(CardProfile $profile, string $strategyId): array
    {
        $out = [];
        foreach ($this->taxonomy->package($strategyId) as $component => $definition) {
            if ($profile->matchesAnyNeedle($definition['needles'])) {
                $out[] = (string) $component;
            }
        }

        return $out;
    }

    /**
     * Human-readable component labels for explanations.
     *
     * @param list<string> $components
     *
     * @return list<string>
     */
    public function componentLabels(string $strategyId, array $components): array
    {
        $package = $this->taxonomy->package($strategyId);
        $out = [];
        foreach ($components as $component) {
            $label = $package[$component]['label'] ?? null;
            if (is_string($label)) {
                $out[] = $label;
            }
        }

        return $out;
    }

    /**
     * How well a card's mana value fits the strategy's shape.
     *
     * Not a hard curve template — a soft preference that keeps a deck from
     * filling up with seven-drops. Lands are neutral because they have no cost.
     */
    public function curveFit(CardProfile $profile, DeckContext $context, float $commanderCmc): float
    {
        if ($profile->isLand) {
            return 0.6;
        }
        $cmc = $profile->cmc;
        if (null === $cmc) {
            return 0.5;
        }

        // Target the cheaper side of the commander's own cost: Commander decks
        // want to deploy the commander and still act on the same turn.
        $ideal = max(2.0, min(4.0, $commanderCmc * 0.6));

        // A deck already skewing expensive should prefer cheaper additions.
        if ($context->nonLandCount >= 10 && $context->averageManaValue > $ideal) {
            $ideal = max(1.0, $ideal - 0.5);
        }

        return max(0.0, 1.0 - (abs($cmc - $ideal) / 6.0));
    }

    /**
     * @return array<string, int>
     */
    private function packageTargets(string $strategyId): array
    {
        $targets = [];
        foreach ($this->taxonomy->package($strategyId) as $component => $definition) {
            $targets[(string) $component] = (int) $definition['target'];
        }

        return $targets;
    }
}
