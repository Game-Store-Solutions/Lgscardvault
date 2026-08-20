<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Service\Recommend\StrategyCatalog;
use App\Service\Recommend\ThemeTokenizer;

/**
 * Scores candidate cards for a commander, a strategy, and the deck as it stands.
 *
 * The three levels of context from the design, all resolved here:
 *
 *   Level 1  commander → card              (commanderAffinity, precomputed)
 *   Level 2  commander + strategy → card   (strategyAffinity, precomputed)
 *   Level 3  + the deck already built      (relationships, role need,
 *                                           package completion, curve — live)
 *
 * Weights come from configuration and the sum is normalized by the configured
 * total, so output stays 0..1 however the model is tuned. Popularity carries the
 * smallest weight deliberately: the question is not "what cards are popular" but
 * "what makes this specific deck better".
 *
 * Two-phase by design — see PreparedCandidate for why.
 */
final class RecommendationEngine
{
    /** EDHREC rank beyond which popularity contributes nothing. */
    private const POPULARITY_RANK_CEILING = 20000.0;

    /** Deck cards a candidate is measured against for existing-deck synergy. */
    private const SYNERGY_TOP_PARTNERS = 8;

    public function __construct(
        private readonly RecommendationWeights $weights,
        private readonly DeckContextAnalyzer $deckAnalyzer,
        private readonly ThemeAffinityScorer $themeAffinity,
        private readonly StrategyCatalog $catalog,
        private readonly ThemeTokenizer $tokenizer,
    ) {
    }

    /**
     * Score candidates against the current deck state in one call.
     *
     * @param list<CardProfile>            $candidates
     * @param array<string, InventoryItem> $stockByOracle
     *
     * @return list<ScoredCard> ordered by score, highest first
     */
    public function score(
        Card $commander,
        string $strategyId,
        CommanderIntelligence $intelligence,
        DeckContext $deckContext,
        array $candidates,
        array $stockByOracle = [],
    ): array {
        $prepared = $this->prepare($commander, $strategyId, $intelligence, $candidates, $stockByOracle);

        return $this->rescore($commander, $strategyId, $intelligence, $deckContext, $prepared);
    }

    /**
     * Compute everything that does not depend on the current deck.
     *
     * @param list<CardProfile>            $candidates
     * @param array<string, InventoryItem> $stockByOracle
     *
     * @return list<PreparedCandidate>
     */
    public function prepare(
        Card $commander,
        string $strategyId,
        CommanderIntelligence $intelligence,
        array $candidates,
        array $stockByOracle = [],
    ): array {
        $strategyLabel = $this->themeAffinity->label($strategyId);
        // Resolved once: classifying every candidate would otherwise re-read the
        // same rule set hundreds of times.
        $strategyDefinition = $this->catalog->get($strategyId);
        $commanderTags = $this->tokenizer->tokenize($commander);

        $prepared = [];
        foreach ($candidates as $profile) {
            if (!$profile instanceof CardProfile) {
                continue;
            }

            $stat = $intelligence->statFor($profile->oracleId);
            $components = [];
            $reasons = [];

            // --- Level 2: strategy affinity ---------------------------------
            $strategyAffinity = null !== $stat
                ? (float) $stat['strategyAffinity']
                // No reference data for this card: fall back to text and theme
                // matching, which is what the recommender did before reference
                // decks existed.
                : $this->themeAffinity->affinity($commander, $profile, $strategyId);
            $components[RecommendationWeights::STRATEGY_AFFINITY] = $strategyAffinity;
            if ($strategyAffinity >= 0.6) {
                $reasons[] = sprintf('Very strong %s synergy', $strategyLabel);
            } elseif ($strategyAffinity >= 0.3) {
                $reasons[] = sprintf('Fits the %s plan', $strategyLabel);
            } elseif (null !== $stat) {
                $reasons[] = sprintf('Low direct %s synergy', $strategyLabel);
            }

            // --- Level 1: commander affinity -------------------------------
            $commanderAffinity = null !== $stat ? (float) $stat['commanderAffinity'] : 0.0;
            $components[RecommendationWeights::COMMANDER_AFFINITY] = $commanderAffinity;
            if ($commanderAffinity >= 0.6) {
                $reasons[] = sprintf(
                    'Played in %d%% of %s decks',
                    (int) round($commanderAffinity * 100),
                    $commander->getName(),
                );
            }

            // --- Reference deck frequency ----------------------------------
            $inclusionRate = null !== $stat ? (float) $stat['inclusionRate'] : 0.0;
            $components[RecommendationWeights::REFERENCE_FREQUENCY] = $inclusionRate;
            if (null !== $stat && $stat['deckCount'] > 0 && $stat['sampleSize'] > 0) {
                $reasons[] = sprintf(
                    'Appears in %d/%d %s',
                    $stat['deckCount'],
                    $stat['sampleSize'],
                    $intelligence->isExactMatch() ? 'strategy-matched reference decks' : 'reference decks',
                );
            }

            // --- Popularity (deliberately the weakest signal) --------------
            $popularity = $this->popularity($profile->edhrecRank);
            $components[RecommendationWeights::POPULARITY] = $popularity;
            if ($popularity >= 0.75 && $strategyAffinity < 0.3) {
                $reasons[] = sprintf(
                    'Extremely high Commander popularity (EDHREC #%d)',
                    (int) $profile->edhrecRank,
                );
            }

            $classification = null !== $strategyDefinition
                ? $this->catalog->classifyCard($profile->card, $strategyDefinition, $this->tokenizer)
                : ['primary' => StrategyCatalog::ROLE_SUPPORT, 'roles' => [StrategyCatalog::ROLE_SUPPORT], 'reasons' => []];

            $item = $stockByOracle[$profile->oracleId] ?? null;
            $stockQuantity = $item instanceof InventoryItem ? $item->getQuantity() : 0;

            $prepared[] = new PreparedCandidate(
                profile: $profile,
                stat: $stat,
                staticComponents: $components,
                staticReasons: $reasons,
                // Raw matched tags and needles, kept alongside the prose reasons
                // so the UI can show the underlying evidence.
                signals: array_values(array_unique(array_merge(
                    $classification['reasons'],
                    $this->tokenizer->overlap($commanderTags, $profile->tags)['shared'],
                ))),
                // Structural roles say what the card does for the deck skeleton;
                // package components say what it does for the strategy's engine.
                roles: $this->deckAnalyzer->rolesFor($profile),
                packageComponents: $this->deckAnalyzer->componentsFor($profile, $strategyId),
                strategyRole: (string) $classification['primary'],
                strategyRoles: array_values(array_map('strval', $classification['roles'])),
                inventoryItem: $item instanceof InventoryItem ? $item : null,
                stockQuantity: $stockQuantity,
                priceCents: $item instanceof InventoryItem ? $item->getPriceCents() : null,
                confidence: null !== $stat ? (float) $stat['confidence'] : $intelligence->confidence,
            );
        }

        return $prepared;
    }

    /**
     * Apply the deck-dependent terms and produce final scores.
     *
     * Cheap enough to call between every pick of the auto-builder, which is what
     * makes the builder's later choices aware of its earlier ones.
     *
     * @param list<PreparedCandidate> $prepared
     *
     * @return list<ScoredCard>
     */
    public function rescore(
        Card $commander,
        string $strategyId,
        CommanderIntelligence $intelligence,
        DeckContext $deckContext,
        array $prepared,
    ): array {
        $commanderCmc = $commander->getCmc() ?? 0.0;
        $commanderOracle = (string) $commander->getOracleId();
        $deckOracleIds = $deckContext->oracleIds;
        $total = $this->weights->total();
        $hasSynergyData = $intelligence->synergy->hasData();

        $scored = [];
        foreach ($prepared as $candidate) {
            $components = $candidate->staticComponents;
            $reasons = $candidate->staticReasons;
            $profile = $candidate->profile;

            // --- Level 3: synergy with the deck as it stands ---------------
            $synergy = $intelligence->synergy->synergyWithDeck(
                $profile->oracleId,
                $deckOracleIds,
                self::SYNERGY_TOP_PARTNERS,
            );
            $components[RecommendationWeights::EXISTING_DECK_SYNERGY] = $synergy['score'];
            $partnerCount = count($synergy['partners']);
            if ($partnerCount > 0) {
                $reasons[] = sprintf(
                    'Synergizes with %d card%s already selected',
                    $partnerCount,
                    1 === $partnerCount ? '' : 's',
                );
            } elseif ([] !== $deckOracleIds && $hasSynergyData) {
                $reasons[] = 'Limited direct synergy with existing cards';
            }

            // --- Relationship strength -------------------------------------
            // Reference decks always contain their own commander, so a raw pair
            // count with it says nothing. The useful signal is the strongest
            // single relationship the card has inside this deck.
            $components[RecommendationWeights::RELATIONSHIP] = max(
                $intelligence->synergy->relationshipStrength($commanderOracle, $profile->oracleId),
                $synergy['partners'][0]['strength'] ?? 0.0,
            );

            // --- Role need --------------------------------------------------
            $roleNeed = 0.0;
            $neededRole = null;
            foreach ($candidate->roles as $role) {
                $need = $deckContext->roleNeed($role);
                if ($need > $roleNeed) {
                    $roleNeed = $need;
                    $neededRole = $role;
                }
            }
            $components[RecommendationWeights::ROLE_NEED] = $roleNeed;
            if (null !== $neededRole && $roleNeed >= 0.4) {
                $reasons[] = sprintf('Fills a needed %s slot', $this->roleLabel($neededRole));
            }

            // --- Package completion ----------------------------------------
            $packageNeed = 0.0;
            $neededComponent = null;
            foreach ($candidate->packageComponents as $component) {
                $need = $deckContext->packageNeed($component);
                if ($need > $packageNeed) {
                    $packageNeed = $need;
                    $neededComponent = $component;
                }
            }
            // Only pay the bonus once the package is under way; rewarding
            // completion of a package nobody has started is just a second
            // strategy bonus in disguise.
            $packageScore = $deckContext->packageIsStarted() ? $packageNeed : 0.0;
            $components[RecommendationWeights::PACKAGE_COMPLETION] = $packageScore;
            if ($packageScore >= 0.3 && null !== $neededComponent) {
                $labels = $this->deckAnalyzer->componentLabels($strategyId, [$neededComponent]);
                $reasons[] = sprintf(
                    'Completes an underrepresented %s role',
                    strtolower($labels[0] ?? $neededComponent),
                );
            }

            // --- Mana curve fit ---------------------------------------------
            $components[RecommendationWeights::MANA_CURVE] = $this->deckAnalyzer->curveFit(
                $profile,
                $deckContext,
                $commanderCmc,
            );

            // --- Weighted sum ------------------------------------------------
            $raw = 0.0;
            foreach ($components as $key => $value) {
                $raw += $this->weights->get($key) * max(0.0, min(1.0, $value));
            }
            $score = $raw / $total;

            // Stock is applied after the model, so what a store happens to have
            // on the shelf can never reorder strategy fit — it only separates
            // cards that already score alike.
            if ($candidate->isInStock()) {
                $score += $this->weights->stockBonus() * min(1.0, $candidate->stockQuantity / 4);
                $reasons[] = 'In stock at this store';
            } else {
                $reasons[] = 'Not currently in your inventory';
            }

            $scored[] = new ScoredCard(
                profile: $profile,
                score: round(min(1.0, $score), 4),
                components: $this->roundComponents($components),
                reasons: array_values(array_unique($reasons)),
                signals: $candidate->signals,
                roles: $candidate->roles,
                packageComponents: $candidate->packageComponents,
                primaryRole: $this->primaryRole($candidate->roles, $candidate->packageComponents),
                strategyRole: $candidate->strategyRole,
                strategyRoles: $candidate->strategyRoles,
                inventoryItem: $candidate->inventoryItem,
                stockQuantity: $candidate->stockQuantity,
                priceCents: $candidate->priceCents,
                confidence: $candidate->confidence,
            );
        }

        usort($scored, static function (ScoredCard $a, ScoredCard $b): int {
            // Name breaks ties so ordering is deterministic across runs, which
            // tests and cached responses both depend on.
            return $b->score <=> $a->score
                ?: strcmp($a->profile->name, $b->profile->name);
        });

        return $scored;
    }

    /**
     * Log-scaled EDHREC rank. Rank 1 approaches 1.0, rank ~20k and beyond is 0.
     * Unranked cards score 0 rather than being penalised — plenty of perfectly
     * good cards have no rank.
     */
    private function popularity(?int $edhrecRank): float
    {
        if (null === $edhrecRank || $edhrecRank < 1) {
            return 0.0;
        }

        $ceiling = log10(self::POPULARITY_RANK_CEILING);

        return max(0.0, min(1.0, ($ceiling - log10((float) $edhrecRank)) / $ceiling));
    }

    /**
     * @param list<string> $roles
     * @param list<string> $packageComponents
     */
    private function primaryRole(array $roles, array $packageComponents): string
    {
        // A package component is a more informative label than "removal", so
        // prefer it when the card supplies one.
        if ([] !== $packageComponents) {
            return $packageComponents[0];
        }

        foreach ([
            DeckContextAnalyzer::ROLE_FINISHER,
            DeckContextAnalyzer::ROLE_REMOVAL,
            DeckContextAnalyzer::ROLE_BOARD_WIPE,
            DeckContextAnalyzer::ROLE_DRAW,
            DeckContextAnalyzer::ROLE_RAMP,
            DeckContextAnalyzer::ROLE_PROTECTION,
            DeckContextAnalyzer::ROLE_LANDS,
        ] as $preferred) {
            if (in_array($preferred, $roles, true)) {
                return $preferred;
            }
        }

        return 'utility';
    }

    private function roleLabel(string $role): string
    {
        return match ($role) {
            DeckContextAnalyzer::ROLE_LANDS => 'land',
            DeckContextAnalyzer::ROLE_BOARD_WIPE => 'board wipe',
            DeckContextAnalyzer::ROLE_RAMP => 'ramp',
            DeckContextAnalyzer::ROLE_DRAW => 'card advantage',
            DeckContextAnalyzer::ROLE_REMOVAL => 'removal',
            DeckContextAnalyzer::ROLE_PROTECTION => 'protection',
            DeckContextAnalyzer::ROLE_FINISHER => 'finisher',
            default => $role,
        };
    }

    /**
     * @param array<string, float> $components
     *
     * @return array<string, float>
     */
    private function roundComponents(array $components): array
    {
        $out = [];
        foreach ($components as $key => $value) {
            $out[$key] = round(max(0.0, min(1.0, $value)), 4);
        }

        return $out;
    }
}
