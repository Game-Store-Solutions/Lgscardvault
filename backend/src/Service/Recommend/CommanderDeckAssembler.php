<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\Store;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;
use App\Service\Recommend\Intelligence\CandidateGenerator;
use App\Service\Recommend\Intelligence\CommanderIntelligenceProvider;
use App\Service\Recommend\Intelligence\CommanderLegalityValidator;
use App\Service\Recommend\Intelligence\DeckContextAnalyzer;
use App\Service\Recommend\Intelligence\PreparedCandidate;
use App\Service\Recommend\Intelligence\RecommendationEngine;
use App\Service\Recommend\Intelligence\ScoredCard;
use App\Service\Recommend\Intelligence\StrategyTaxonomy;

/**
 * Builds a 100-card Commander deck around a commander *and a strategy*.
 *
 * The previous assembler ignored strategy entirely and filled fixed quotas from
 * a stock list ordered by EDHREC rank, which is why its output read as "99
 * popular cards in these colors" rather than a deck with a plan. This version
 * drives the recommendation engine and re-scores between picks, so every choice
 * is made in the context of what has already been chosen.
 *
 * Construction order is deliberate. Structural requirements are satisfied first
 * but only ever from strategy-appropriate cards, so hitting a ramp quota cannot
 * pull in an off-plan mana rock when an on-plan one exists. Requirements are
 * per-strategy, not universal: a landfall deck wants more lands and ramp, a token
 * deck wants fewer board wipes, an artifact deck counts its mana rocks as both
 * ramp and strategy density.
 *
 * Legality is never negotiable — singleton, color identity, and format legality
 * are enforced at pick time regardless of how well a card scores.
 */
final class CommanderDeckAssembler
{
    private const DECK_SIZE = 100;

    /**
     * Cards picked between re-scores. One-at-a-time would be ideal but costs 99
     * passes; a small batch keeps the deck responsive to its own contents while
     * holding the build well under a second.
     */
    private const RESCORE_BATCH = 6;

    /** Safety valve on the greedy loop. */
    private const MAX_ROUNDS = 40;

    public function __construct(
        private readonly ColorIdentityParser $colorIdentity,
        private readonly SectionSerializer $sectionSerializer,
        private readonly StrategyTaxonomy $taxonomy,
        private readonly CommanderRecommender $recommender,
        private readonly CommanderIntelligenceProvider $intelligenceProvider,
        private readonly CandidateGenerator $candidates,
        private readonly RecommendationEngine $engine,
        private readonly DeckContextAnalyzer $deckAnalyzer,
        private readonly CommanderLegalityValidator $legality,
        private readonly ThemeTokenizer $tokenizer,
        private readonly StoreComboAnalyzer $comboAnalyzer,
    ) {
    }

    /**
     * @param array{
     *   strategy?: string|null,
     *   budgetCents?: int|null,
     *   maxCardCents?: int|null,
     *   bracket?: int|null,
     *   includeOutOfStock?: bool
     * } $options
     *
     * @return array<string, mixed>
     */
    public function assemble(?Store $store, Card $commander, array $options = []): array
    {
        $budgetCents = $this->positiveCents($options['budgetCents'] ?? null);
        $maxCardCents = $this->positiveCents($options['maxCardCents'] ?? null);
        $includeOutOfStock = (bool) ($options['includeOutOfStock'] ?? true);

        $supported = $this->recommender->strategiesFor($commander);
        $strategyId = $this->resolveStrategy($options['strategy'] ?? null, $supported);

        $intelligence = $this->intelligenceProvider->forCommander($commander, $strategyId);
        // Basic lands are in scope here (unlike the browsing list) because the
        // builder has to produce a real mana base.
        $generated = $this->candidates->generate(
            $store,
            $commander,
            $intelligence,
            [],
            $includeOutOfStock,
            includeBasicLands: true,
        );
        $prepared = $this->engine->prepare(
            $commander,
            $strategyId,
            $intelligence,
            $generated['candidates'],
            $generated['stockByOracle'],
        );

        $gameChangersInStock = $this->gameChangersInStock($prepared);
        $requestedBracket = CommanderBracket::clamp(isset($options['bracket']) ? (int) $options['bracket'] : null);
        $appliedBracket = $requestedBracket ?? CommanderBracket::suggestFromGameChangerCount(count($gameChangersInStock));
        $maxGameChangers = CommanderBracket::maxGameChangers($appliedBracket);

        $structure = $this->taxonomy->structure($strategyId);
        $targetNonCommander = self::DECK_SIZE - 1;
        $landTarget = max(0, (int) ($structure[DeckContextAnalyzer::ROLE_LANDS] ?? 36));

        /** @var array<string, ScoredCard> $picked */
        $picked = [];
        /** @var array<string, int> $quantities oracle id => copies in the deck */
        $quantities = [];
        $includedGameChangers = [];
        $spentCents = 0;
        $landCount = 0;
        $totalCards = 0;

        $nonLandBudget = max(0, $targetNonCommander - $landTarget);
        $nonLandCount = 0;

        $canPick = function (PreparedCandidate $candidate) use (
            &$quantities,
            &$includedGameChangers,
            &$spentCents,
            &$landCount,
            &$nonLandCount,
            $commander,
            $budgetCents,
            $maxCardCents,
            $maxGameChangers,
            $landTarget,
            $nonLandBudget,
        ): bool {
            $profile = $candidate->profile;

            // Legality first, always. Singleton is checked against what we have
            // already taken, which is why it cannot live in candidate generation.
            // Basic lands are the format's one exception and may repeat.
            if (!$this->legality->isLegal($commander, $profile->card, $quantities)) {
                return false;
            }

            // The land count is a hard structural constraint in both directions,
            // not a scoring preference. Scoring alone will always prefer another
            // synergy piece to another land, so a purely score-driven build
            // finishes at 99 cards with an unplayable mana base. Reserving the
            // slots lets scoring decide *which* lands without letting it decide
            // whether to have any.
            if ($profile->isLand) {
                if ($landCount >= $landTarget) {
                    return false;
                }
            } elseif ($nonLandCount >= $nonLandBudget) {
                return false;
            }

            $price = $candidate->priceCents ?? 0;
            if (null !== $maxCardCents && !$profile->isBasicLand && $price > $maxCardCents) {
                return false;
            }
            if (null !== $budgetCents && ($spentCents + $price) > $budgetCents) {
                return false;
            }
            if ($profile->isGameChanger && count($includedGameChangers) >= $maxGameChangers) {
                return false;
            }

            return true;
        };

        // Greedy construction with re-scoring: each round scores every remaining
        // candidate against the deck built so far, so role need, package gaps,
        // curve, and card-to-card synergy all shift as the deck fills.
        $remaining = $prepared;
        for ($round = 0; $round < self::MAX_ROUNDS; ++$round) {
            if ($totalCards >= $targetNonCommander || [] === $remaining) {
                break;
            }

            $deckContext = $this->deckAnalyzer->analyze($this->flatten($quantities), $strategyId);
            $ranked = $this->engine->rescore($commander, $strategyId, $intelligence, $deckContext, $remaining);

            $takenThisRound = 0;
            $stillRemaining = [];
            $byOracle = $this->indexPrepared($remaining);

            foreach ($ranked as $scored) {
                $oracleId = $scored->oracleId();
                $candidate = $byOracle[$oracleId] ?? null;
                if (null === $candidate) {
                    continue;
                }

                if ($totalCards >= $targetNonCommander || $takenThisRound >= self::RESCORE_BATCH) {
                    $stillRemaining[] = $candidate;
                    continue;
                }

                if (!$canPick($candidate)) {
                    // Budget and bracket rejections are not permanent — a
                    // cheaper deck state later might allow them — but keeping
                    // them in the pool risks spinning, so drop them and let the
                    // gap report surface the shortfall.
                    continue;
                }

                $picked[$oracleId] = $scored;
                $quantities[$oracleId] = ($quantities[$oracleId] ?? 0) + 1;
                ++$totalCards;
                $spentCents += $scored->priceCents ?? 0;
                if ($scored->profile->isLand) {
                    ++$landCount;
                } else {
                    ++$nonLandCount;
                }
                if ($scored->profile->isGameChanger) {
                    $includedGameChangers[] = [
                        'name' => $scored->profile->name,
                        'oracleId' => $oracleId,
                        'priceCents' => $scored->priceCents,
                    ];
                }
                ++$takenThisRound;

                // A basic land can legally repeat, so keep it available for the
                // remaining land slots instead of retiring it after one copy.
                if ($scored->profile->isBasicLand) {
                    $stillRemaining[] = $candidate;
                }
            }

            $remaining = $stillRemaining;
            if (0 === $takenThisRound) {
                // Nothing legal or affordable left; further rounds cannot help.
                break;
            }
        }

        $finalContext = $this->deckAnalyzer->analyze($this->flatten($quantities), $strategyId);
        $cards = $this->serializeDeck($picked, $quantities);

        $combos = $this->comboAnalyzer->analyzeForCommander(
            $store,
            $commander,
            array_map(static fn (ScoredCard $c): string => $c->profile->name, array_values($picked)),
            12,
        );

        return [
            'commander' => [
                'id' => (string) $commander->getId(),
                'oracleId' => (string) $commander->getOracleId(),
                'name' => $commander->getName(),
                'typeLine' => $commander->getTypeLine(),
                'manaCost' => $commander->getManaCost(),
                'cmc' => $commander->getCmc(),
                'colorIdentity' => $commander->getColorIdentity() ?? [],
                'imageUrl' => $commander->getImageUrl(),
                'themes' => $this->tokenizer->tokenize($commander),
            ],
            'identityCode' => $this->colorIdentity->identityCode($commander->getColorIdentity()),
            'strategies' => $supported,
            'strategy' => [
                'id' => $strategyId,
                'label' => $this->taxonomy->label($strategyId),
                'description' => $this->taxonomy->description($strategyId),
            ],
            'intelligence' => $intelligence->toArray(),
            'targetSize' => self::DECK_SIZE,
            // Copies, not distinct names: a deck with 30 Plains is 30 cards.
            'filledSize' => $totalCards + 1,
            'distinctCards' => count($picked) + 1,
            'slots' => $this->slotSummary($picked, $quantities, $landCount, count($includedGameChangers)),
            'structure' => [
                'targets' => $finalContext->roleTargets,
                'actual' => $finalContext->roleCounts,
                'packageTargets' => $finalContext->packageTargets,
                'packageActual' => $finalContext->packageCounts,
            ],
            'curve' => $finalContext->curve,
            'averageManaValue' => round($finalContext->averageManaValue, 2),
            'gaps' => $this->gaps($finalContext, $totalCards, $targetNonCommander, $budgetCents, $spentCents, $strategyId),
            'cards' => $cards,
            'combos' => $combos['combos'],
            'budget' => [
                'limitCents' => $budgetCents,
                'maxCardCents' => $maxCardCents,
                'spentCents' => $spentCents,
                'remainingCents' => null === $budgetCents ? null : max(0, $budgetCents - $spentCents),
            ],
            'bracket' => [
                'requested' => $requestedBracket,
                'applied' => $appliedBracket,
                'label' => CommanderBracket::label($appliedBracket),
                'auto' => null === $requestedBracket,
                'maxGameChangers' => \PHP_INT_MAX === $maxGameChangers ? null : $maxGameChangers,
                'gameChangersInStock' => array_values($gameChangersInStock),
                'gameChangersIncluded' => $includedGameChangers,
                'accommodated' => count($gameChangersInStock) >= min(3, \PHP_INT_MAX === $maxGameChangers ? 4 : $maxGameChangers)
                    || 0 === CommanderBracket::maxGameChangers($appliedBracket),
            ],
            'inventoryIds' => array_values(array_filter(array_map(
                static fn (ScoredCard $c): ?int => $c->inventoryItem?->getId(),
                array_values($picked),
            ))),
        ];
    }

    /**
     * @param list<array{id: string}> $supported
     */
    private function resolveStrategy(mixed $requested, array $supported): string
    {
        $ids = array_column($supported, 'id');

        if (!is_string($requested) || '' === trim($requested)) {
            return $ids[0] ?? StrategyTaxonomy::FALLBACK_ID;
        }

        $normalized = $this->taxonomy->normalizeTag($requested) ?? $requested;
        if (!$this->taxonomy->has($normalized)) {
            throw new \InvalidArgumentException(sprintf('Unknown strategy "%s".', $requested));
        }

        return $normalized;
    }

    /**
     * @param list<PreparedCandidate> $prepared
     *
     * @return array<string, PreparedCandidate>
     */
    private function indexPrepared(array $prepared): array
    {
        $out = [];
        foreach ($prepared as $candidate) {
            $out[$candidate->oracleId()] = $candidate;
        }

        return $out;
    }

    /**
     * @param list<PreparedCandidate> $prepared
     *
     * @return array<string, array{name: string, oracleId: string, priceCents: ?int}>
     */
    private function gameChangersInStock(array $prepared): array
    {
        $out = [];
        foreach ($prepared as $candidate) {
            if (!$candidate->profile->isGameChanger || !$candidate->isInStock()) {
                continue;
            }
            $out[$candidate->oracleId()] = [
                'name' => $candidate->profile->name,
                'oracleId' => $candidate->oracleId(),
                'priceCents' => $candidate->priceCents,
            ];
        }

        return $out;
    }

    /**
     * Expand a quantity map into a flat list, so the deck context sees the real
     * card count rather than the number of distinct names.
     *
     * @param array<string, int> $quantities
     *
     * @return list<string>
     */
    private function flatten(array $quantities): array
    {
        $out = [];
        foreach ($quantities as $oracleId => $count) {
            for ($i = 0; $i < $count; ++$i) {
                $out[] = (string) $oracleId;
            }
        }

        return $out;
    }

    /**
     * @param array<string, ScoredCard> $picked
     * @param array<string, int>        $quantities
     *
     * @return list<array<string, mixed>>
     */
    private function serializeDeck(array $picked, array $quantities): array
    {
        $rows = [];
        foreach ($picked as $oracleId => $card) {
            $rows[] = [
                'slot' => $card->primaryRole,
                'quantity' => $quantities[$oracleId] ?? 1,
                'role' => $card->strategyRole,
                'deckRoles' => $card->roles,
                'packageComponents' => $card->packageComponents,
                'score' => $card->score,
                'confidence' => round($card->confidence, 3),
                'reasons' => $card->reasons,
                'signals' => $card->signals,
                'scoreBreakdown' => $card->components,
                'gameChanger' => $card->profile->isGameChanger,
                'inStock' => $card->isInStock(),
                'stockQuantity' => $card->stockQuantity,
                'priceCents' => $card->priceCents,
                'card' => [
                    'id' => (string) $card->profile->card->getId(),
                    'oracleId' => $card->oracleId(),
                    'name' => $card->profile->name,
                    'typeLine' => $card->profile->card->getTypeLine(),
                    'manaCost' => $card->profile->card->getManaCost(),
                    'cmc' => $card->profile->cmc,
                    'imageUrl' => $card->profile->card->getImageUrl(),
                    'edhrecRank' => $card->profile->edhrecRank,
                ],
                'inventoryItem' => null !== $card->inventoryItem
                    ? $this->sectionSerializer->serializeInventoryItem($card->inventoryItem)
                    : null,
            ];
        }

        // Lands last so the list reads like a decklist rather than a mana base
        // followed by the interesting cards.
        usort($rows, static function (array $a, array $b): int {
            $aLand = DeckContextAnalyzer::ROLE_LANDS === $a['slot'] ? 1 : 0;
            $bLand = DeckContextAnalyzer::ROLE_LANDS === $b['slot'] ? 1 : 0;

            return ($aLand <=> $bLand)
                ?: ($b['score'] <=> $a['score'])
                ?: strcmp((string) $a['card']['name'], (string) $b['card']['name']);
        });

        return $rows;
    }

    /**
     * @param array<string, ScoredCard> $picked
     * @param array<string, int>        $quantities
     *
     * @return array<string, int>
     */
    private function slotSummary(array $picked, array $quantities, int $landCount, int $gameChangerCount): array
    {
        $slots = ['commander' => 1, DeckContextAnalyzer::ROLE_LANDS => $landCount];
        foreach ($picked as $oracleId => $card) {
            if ($card->profile->isLand) {
                continue;
            }
            $slots[$card->primaryRole] = ($slots[$card->primaryRole] ?? 0) + ($quantities[$oracleId] ?? 1);
        }
        $slots['game_changer'] = $gameChangerCount;

        return $slots;
    }

    /**
     * Actionable shortfalls, phrased in terms of what to buy or stock rather
     * than internal counters.
     *
     * @return list<string>
     */
    private function gaps(
        \App\Service\Recommend\Intelligence\DeckContext $context,
        int $pickedCount,
        int $target,
        ?int $budgetCents,
        int $spentCents,
        string $strategyId,
    ): array {
        $gaps = [];

        foreach ($context->roleTargets as $role => $roleTarget) {
            $have = $context->roleCounts[$role] ?? 0;
            if ($roleTarget > 0 && $have < $roleTarget) {
                $gaps[] = sprintf(
                    'Short %d %s (%d of %d)',
                    $roleTarget - $have,
                    str_replace('_', ' ', (string) $role),
                    $have,
                    $roleTarget,
                );
            }
        }

        $package = $this->taxonomy->package($strategyId);
        foreach ($context->incompleteComponents() as $component) {
            $label = $package[$component]['label'] ?? $component;
            $gaps[] = sprintf(
                'Wants more %s (%d of %d)',
                strtolower((string) $label),
                $context->packageCounts[$component] ?? 0,
                $context->packageTargets[$component] ?? 0,
            );
        }

        if ($pickedCount < $target) {
            $gaps[] = sprintf('Deck short %d cards from available candidates', $target - $pickedCount);
        }
        if (null !== $budgetCents && $spentCents > $budgetCents) {
            $gaps[] = 'Deck exceeds the requested budget';
        }

        return $gaps;
    }

    private function positiveCents(mixed $value): ?int
    {
        if (null === $value || '' === $value) {
            return null;
        }
        $cents = (int) $value;

        return $cents > 0 ? $cents : null;
    }
}
