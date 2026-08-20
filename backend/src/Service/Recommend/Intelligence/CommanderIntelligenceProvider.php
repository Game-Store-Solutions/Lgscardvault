<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Entity\CommanderCardStat;
use App\Message\RefreshCommanderIntelligenceMessage;
use App\Repository\CommanderCardStatRepository;
use App\Repository\CommanderStrategyStatRepository;
use App\Repository\ReferenceDeckRepository;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Uid\Uuid;
use Symfony\Contracts\Service\ResetInterface;

/**
 * Read side of the intelligence layer: resolves the best available scope for a
 * commander/strategy pair and loads the precomputed data behind it.
 *
 * Everything here is indexed reads of tables the background refresher wrote —
 * no provider HTTP, no aggregation. When data is missing or stale it queues a
 * refresh and serves the best fallback available, so the first request for a
 * cold commander is degraded rather than slow.
 *
 * Fallback ladder, in order:
 *
 *   commander + exact strategy
 *     → commander + related strategy
 *       → commander overall
 *         → strategy across all commanders
 *           → card metadata only (the pre-existing theme-matching behaviour)
 */
final class CommanderIntelligenceProvider implements ResetInterface
{
    /** Decks needed before a scope is served as an exact match. */
    private const MIN_SCOPE_SAMPLE = 3;

    /**
     * Decks read for the co-occurrence matrix.
     *
     * Wider than a single strategy scope on purpose — see load() for why the
     * matrix is always commander-wide.
     */
    private const MATRIX_DECK_LIMIT = 40;

    /** @var array<string, CommanderIntelligence> */
    private array $memo = [];

    /** @var array<string, true> */
    private array $queuedRefreshes = [];

    public function __construct(
        private readonly CommanderCardStatRepository $cardStats,
        private readonly CommanderStrategyStatRepository $strategyStats,
        private readonly ReferenceDeckRepository $referenceDecks,
        private readonly StrategyTaxonomy $taxonomy,
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
        private readonly int $maxAgeDays = 90,
    ) {
    }

    public function forCommander(Card $commander, string $strategyId): CommanderIntelligence
    {
        $commanderOracle = $commander->getOracleId();
        $memoKey = strtolower((string) $commanderOracle).'|'.$strategyId;
        if (isset($this->memo[$memoKey])) {
            return $this->memo[$memoKey];
        }

        $this->queueRefreshIfStale($commander);

        return $this->memo[$memoKey] = $this->resolve($commanderOracle, $strategyId);
    }

    /**
     * Drop the per-request memo.
     *
     * The memo exists so scoring several strategies in one request reads the
     * database once. In a long-running worker the service instance outlives the
     * request, so without this a refresh would be invisible until the process
     * restarted. Symfony's service resetter calls this between requests.
     */
    public function reset(): void
    {
        $this->memo = [];
        $this->queuedRefreshes = [];
    }

    /**
     * Strategies we have actually observed for a commander, with real sample
     * sizes. Callers merge this with commander-text detection so the picker can
     * offer strategies even before any decks are harvested.
     *
     * @return list<array{id: string, label: string, description: string, deckCount: int, sampleSize: int, confidence: float, source: string}>
     */
    public function observedStrategies(Card $commander): array
    {
        $out = [];
        foreach ($this->strategyStats->findForCommander($commander->getOracleId()) as $stat) {
            $slug = $stat->getStrategyId();
            $out[] = [
                'id' => $slug,
                'label' => $this->taxonomy->label($slug),
                'description' => $this->taxonomy->description($slug),
                'deckCount' => $stat->getDeckCount(),
                'sampleSize' => $stat->getSampleSize(),
                'confidence' => $stat->getConfidence(),
                'source' => $stat->getSource(),
            ];
        }

        return $out;
    }

    private function resolve(Uuid $commanderOracle, string $strategyId): CommanderIntelligence
    {
        // 1. Exact commander + strategy.
        $exact = $this->strategyStats->findOneForScope($commanderOracle, $strategyId);
        if (null !== $exact && $exact->getDeckCount() >= self::MIN_SCOPE_SAMPLE) {
            return $this->load(
                $commanderOracle,
                $strategyId,
                $strategyId,
                CommanderIntelligence::LEVEL_COMMANDER_STRATEGY,
                $exact->getDeckCount(),
                $exact->getConfidence(),
            );
        }

        // 2. A related strategy for the same commander.
        foreach ($this->taxonomy->relatedSlugs($strategyId) as $related) {
            $stat = $this->strategyStats->findOneForScope($commanderOracle, $related);
            if (null !== $stat && $stat->getDeckCount() >= self::MIN_SCOPE_SAMPLE) {
                return $this->load(
                    $commanderOracle,
                    $strategyId,
                    $related,
                    CommanderIntelligence::LEVEL_RELATED_STRATEGY,
                    $stat->getDeckCount(),
                    // A neighbouring archetype is real data but not the data we
                    // asked for, so cap what it can claim.
                    min(0.7, $stat->getConfidence()),
                );
            }
        }

        // 3. Everything we hold for this commander, strategy ignored.
        $overallSample = $this->referenceDecks->countForCommander($commanderOracle);
        if ($overallSample > 0 && $this->cardStats->countForScope($commanderOracle, CommanderCardStat::STRATEGY_OVERALL) > 0) {
            return $this->load(
                $commanderOracle,
                $strategyId,
                CommanderCardStat::STRATEGY_OVERALL,
                CommanderIntelligence::LEVEL_COMMANDER_OVERALL,
                $overallSample,
                min(0.6, $overallSample / 7),
            );
        }

        // 4. The archetype across every commander we know.
        $global = $this->cardStats->globalStrategyStats($strategyId);
        if ([] !== $global) {
            $stats = [];
            foreach ($global as $oracleId => $row) {
                $stats[$oracleId] = [
                    'deckCount' => 0,
                    'sampleSize' => $row['commanderCount'],
                    'inclusionRate' => $row['inclusionRate'],
                    // Nothing here is specific to this commander, so commander
                    // affinity is genuinely unknown rather than zero-ish.
                    'commanderAffinity' => 0.0,
                    'strategyAffinity' => $row['strategyAffinity'],
                    'averageQuantity' => 1.0,
                    'baseScore' => $row['strategyAffinity'],
                    'confidence' => 0.35,
                    'roleHint' => null,
                ];
            }

            return new CommanderIntelligence(
                requestedStrategyId: $strategyId,
                resolvedStrategyId: $strategyId,
                fallbackLevel: CommanderIntelligence::LEVEL_STRATEGY_GLOBAL,
                sampleSize: 0,
                confidence: 0.35,
                cardStats: $stats,
                // No commander-scoped decklists, so there is no honest
                // co-occurrence sample. An empty engine returns zero rather
                // than inventing relationships.
                synergy: new SynergyEngine(),
            );
        }

        // 5. Nothing at all.
        return CommanderIntelligence::empty($strategyId);
    }

    private function load(
        Uuid $commanderOracle,
        string $requestedStrategyId,
        string $scopeStrategyId,
        string $level,
        int $sampleSize,
        float $confidence,
    ): CommanderIntelligence {
        $stats = $this->cardStats->statsForScope($commanderOracle, $scopeStrategyId);

        // The co-occurrence matrix spans *all* of this commander's decks, not
        // just the selected strategy's. Lift needs variance in the marginals to
        // say anything: inside a single strategy scope the archetype's staples
        // all sit at ~100% inclusion, so every pair computes to lift 1.0 and the
        // engine would conclude that nothing is related to anything. Measured
        // across strategies, a token doubler and a token payoff co-occur far
        // more than their individual play rates predict, while a universal
        // staple that appears in every deck correlates with nothing.
        $matrix = $this->referenceDecks->findDeckMembershipMatrix(
            $commanderOracle,
            null,
            self::MATRIX_DECK_LIMIT,
        );

        return new CommanderIntelligence(
            requestedStrategyId: $requestedStrategyId,
            resolvedStrategyId: $scopeStrategyId,
            fallbackLevel: $level,
            sampleSize: $sampleSize,
            confidence: max(0.0, min(1.0, $confidence)),
            cardStats: $stats,
            synergy: new SynergyEngine($matrix),
        );
    }

    /**
     * Warm a cold or stale commander in the background.
     *
     * Deliberately fire-and-forget: the current request is served from whatever
     * fallback is available instead of waiting on provider HTTP. Guarded per
     * request so a page that scores several strategies queues one job, not five.
     */
    private function queueRefreshIfStale(Card $commander): void
    {
        $cardId = (string) $commander->getId();
        if (isset($this->queuedRefreshes[$cardId])) {
            return;
        }

        $lastUpdated = $this->strategyStats->lastUpdatedAt($commander->getOracleId());
        $cutoff = new \DateTimeImmutable(sprintf('-%d days', max(1, $this->maxAgeDays)));
        if (null !== $lastUpdated && $lastUpdated > $cutoff) {
            return;
        }

        $this->queuedRefreshes[$cardId] = true;

        try {
            $this->bus->dispatch(new RefreshCommanderIntelligenceMessage($cardId));
        } catch (\Throwable $e) {
            // A full or unreachable queue must never break a recommendation.
            $this->logger->warning('Could not queue commander intelligence refresh: '.$e->getMessage());
        }
    }
}
