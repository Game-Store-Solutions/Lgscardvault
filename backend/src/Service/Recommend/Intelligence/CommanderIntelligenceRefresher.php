<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Entity\CommanderCardStat;
use App\Entity\CommanderStrategyStat;
use App\Entity\ReferenceDeck;
use App\Entity\ReferenceDeckCard;
use App\Repository\CommanderCardStatRepository;
use App\Repository\CommanderStrategyStatRepository;
use App\Repository\ReferenceDeckRepository;
use App\Service\Recommend\Provider\DeckDataProviderInterface;
use App\Service\Recommend\Provider\ReferenceDeckPayload;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Offline analysis: turns harvested reference decks into the precomputed
 * statistics the request path reads.
 *
 * Runs from a Messenger worker, never from a web request. Everything expensive
 * lives here — provider HTTP, classification of every card in every deck, and
 * the aggregate writes — so a recommendation request is reduced to a couple of
 * indexed reads plus in-memory scoring of the user's own deck.
 */
final class CommanderIntelligenceRefresher
{
    /**
     * Cards appearing in only one reference deck are usually pet cards rather
     * than signal. Keeping them would triple the table for no ranking benefit.
     * Applied only when the sample is large enough for "once" to mean something.
     */
    private const MIN_DECK_COUNT_FOR_LARGE_SAMPLE = 2;
    private const LARGE_SAMPLE_THRESHOLD = 5;

    /** Reference decks needed before we consider a sample fully trustworthy. */
    private const CONFIDENT_SAMPLE_SIZE = 7;

    private const FLUSH_EVERY = 200;

    public function __construct(
        private readonly DeckDataProviderInterface $deckProvider,
        private readonly StrategyClassifier $classifier,
        private readonly StrategyTaxonomy $taxonomy,
        private readonly CardProfileIndex $profiles,
        private readonly ReferenceDeckRepository $referenceDecks,
        private readonly CommanderCardStatRepository $cardStats,
        private readonly CommanderStrategyStatRepository $strategyStats,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly int $harvestDepth = 50,
        private readonly int $decksPerStrategy = 10,
    ) {
    }

    /**
     * Harvest, classify, and aggregate everything we know about one commander.
     *
     * @return array{decks: int, strategies: int, cardStats: int, providers: list<string>}
     */
    public function refresh(Card $commander): array
    {
        $commanderOracle = $commander->getOracleId();
        $oracleKey = strtolower((string) $commanderOracle);

        $payloads = $this->harvest($oracleKey, $commander->getName());
        $stored = $this->persistReferenceDecks($commanderOracle, $payloads);

        $decks = $this->referenceDecks->findForCommander($commanderOracle, $this->harvestDepth);
        $result = $this->rebuildAggregates($commanderOracle, $decks);

        $this->logger->info(
            'Commander intelligence refreshed for {commander}: {decks} reference decks, {strategies} strategies, {stats} card stats.',
            [
                'commander' => $commander->getName(),
                'decks' => count($decks),
                'strategies' => $result['strategies'],
                'stats' => $result['cardStats'],
            ],
        );

        return [
            'decks' => $stored,
            'strategies' => $result['strategies'],
            'cardStats' => $result['cardStats'],
            'providers' => $this->providerNames(),
        ];
    }

    /** @return list<ReferenceDeckPayload> */
    private function harvest(string $commanderOracleId, string $commanderName): array
    {
        if (!$this->deckProvider->isAvailable()) {
            $this->logger->notice('No reference deck provider is available; keeping existing aggregates.');

            return [];
        }

        $payloads = $this->deckProvider->getPopularDecks(
            $commanderOracleId,
            $commanderName,
            null,
            $this->harvestDepth,
        );

        return array_values(array_filter(
            $payloads,
            static fn (ReferenceDeckPayload $p): bool => $p->looksLikeCommanderDeck() && $p->hasCommander($commanderOracleId),
        ));
    }

    /**
     * @param list<ReferenceDeckPayload> $payloads
     *
     * @return int decks written or refreshed
     */
    private function persistReferenceDecks(Uuid $commanderOracle, array $payloads): int
    {
        if ([] === $payloads) {
            return 0;
        }

        // Warm every card in one query before classification touches them.
        $allOracles = [];
        foreach ($payloads as $payload) {
            foreach ($payload->oracleIds() as $oracleId) {
                $allOracles[$oracleId] = true;
            }
        }
        $this->profiles->preload(array_keys($allOracles));

        $written = 0;
        foreach ($payloads as $payload) {
            $deck = $this->referenceDecks->findOneByExternalId($payload->provider, $payload->externalId)
                ?? new ReferenceDeck($payload->provider, $payload->externalId, $commanderOracle);

            $strategies = array_column($this->classifier->classifyDeck($payload), 'id');

            $deck->setName($payload->name)
                ->setPopularity($payload->popularity)
                ->setBracket($payload->bracket)
                ->setProviderTags($payload->providerTags)
                ->setStrategyIds($strategies)
                ->setCardCount($payload->cardCount())
                ->setUrl($payload->url)
                ->setSourceUpdatedAt($payload->updatedAt)
                ->touchFetchedAt();

            $partner = null;
            foreach ($payload->commanderOracleIds as $candidate) {
                if ($candidate !== strtolower((string) $commanderOracle)) {
                    $partner = $candidate;
                    break;
                }
            }
            $deck->setPartnerOracleId(null !== $partner ? $this->toUuid($partner) : null);

            // Replace card rows wholesale: a re-harvested deck may have been
            // edited upstream, and diffing rows costs more than rewriting ~100.
            if (null !== $deck->getId()) {
                $this->em->createQueryBuilder()
                    ->delete(ReferenceDeckCard::class, 'rc')
                    ->andWhere('rc.referenceDeck = :deck')
                    ->setParameter('deck', $deck)
                    ->getQuery()
                    ->execute();
                $deck->clearCards();
            }

            $this->em->persist($deck);

            foreach ($payload->cards as $oracleId => $quantity) {
                $uuid = $this->toUuid((string) $oracleId);
                if (null === $uuid) {
                    continue;
                }
                $this->em->persist(new ReferenceDeckCard(
                    $deck,
                    $uuid,
                    (int) $quantity,
                    $payload->roleHints[$oracleId] ?? null,
                ));
            }

            ++$written;
            if (0 === $written % self::FLUSH_EVERY) {
                $this->em->flush();
            }
        }

        $this->em->flush();

        return $written;
    }

    /**
     * Recompute every aggregate scope for a commander from stored decks.
     *
     * @param list<ReferenceDeck> $decks
     *
     * @return array{strategies: int, cardStats: int}
     */
    private function rebuildAggregates(Uuid $commanderOracle, array $decks): array
    {
        $this->cardStats->deleteForCommander($commanderOracle);
        $this->strategyStats->deleteForCommander($commanderOracle);
        $this->em->flush();

        if ([] === $decks) {
            return ['strategies' => 0, 'cardStats' => 0];
        }

        $sampleSize = count($decks);
        $membership = $this->referenceDecks->findMembershipWithQuantities(
            array_values(array_filter(array_map(
                static fn (ReferenceDeck $deck): ?int => $deck->getId(),
                $decks,
            ))),
        );
        if ([] === $membership) {
            return ['strategies' => 0, 'cardStats' => 0];
        }

        // Commander-wide baseline first: per-strategy lift is measured against
        // it, so it has to exist before any strategy scope is computed.
        $overall = $this->aggregateScope($membership, array_keys($membership));
        $written = $this->writeCardStats(
            $commanderOracle,
            CommanderCardStat::STRATEGY_OVERALL,
            $overall,
            $sampleSize,
            $sampleSize,
            $overall,
        );

        // `$decks` arrives in popularity order, so slicing keeps the most
        // relevant decks per strategy. A cap matters because a widely-played
        // commander can accumulate far more decks than a strategy's statistics
        // benefit from, and the long tail is mostly half-finished brews.
        $strategyDecks = [];
        foreach ($decks as $deck) {
            foreach ($deck->getStrategyIds() as $strategyId) {
                if (count($strategyDecks[$strategyId] ?? []) >= $this->decksPerStrategy) {
                    continue;
                }
                $strategyDecks[$strategyId][] = (string) $deck->getId();
            }
        }

        $strategyCount = 0;
        foreach ($strategyDecks as $strategyId => $deckIds) {
            $scopeSize = count($deckIds);
            $scope = $this->aggregateScope($membership, $deckIds);
            $source = $this->strategySource($decks, (string) $strategyId);

            $stat = new CommanderStrategyStat($commanderOracle, (string) $strategyId);
            $stat->setDeckCount($scopeSize)
                ->setSampleSize($sampleSize)
                ->setConfidence($this->confidenceFor($scopeSize, $source))
                ->setSource($source);
            $this->em->persist($stat);
            ++$strategyCount;

            $written += $this->writeCardStats(
                $commanderOracle,
                (string) $strategyId,
                $scope,
                $scopeSize,
                $sampleSize,
                $overall,
            );
        }

        $this->em->flush();

        return ['strategies' => $strategyCount, 'cardStats' => $written];
    }

    /**
     * Per-card counts within a set of decks.
     *
     * @param array<string, array<string, int>> $membership
     * @param list<string>                      $deckIds
     *
     * @return array<string, array{deckCount: int, quantity: int}>
     */
    private function aggregateScope(array $membership, array $deckIds): array
    {
        $counts = [];
        foreach ($deckIds as $deckId) {
            foreach ($membership[$deckId] ?? [] as $oracleId => $quantity) {
                if (!isset($counts[$oracleId])) {
                    $counts[$oracleId] = ['deckCount' => 0, 'quantity' => 0];
                }
                ++$counts[$oracleId]['deckCount'];
                $counts[$oracleId]['quantity'] += $quantity;
            }
        }

        return $counts;
    }

    /**
     * @param array<string, array{deckCount: int, quantity: int}> $scope
     * @param array<string, array{deckCount: int, quantity: int}> $overall
     */
    private function writeCardStats(
        Uuid $commanderOracle,
        string $strategyId,
        array $scope,
        int $scopeSize,
        int $overallSize,
        array $overall,
    ): int {
        if ($scopeSize < 1) {
            return 0;
        }

        $isOverall = CommanderCardStat::STRATEGY_OVERALL === $strategyId;
        $confidence = $this->confidenceFor($scopeSize);
        $written = 0;

        foreach ($scope as $oracleId => $row) {
            if ($this->isNoise($row['deckCount'], $scopeSize)) {
                continue;
            }
            $uuid = $this->toUuid((string) $oracleId);
            if (null === $uuid) {
                continue;
            }

            $inclusionRate = $row['deckCount'] / $scopeSize;
            $commanderAffinity = $overallSize > 0
                ? (($overall[$oracleId]['deckCount'] ?? 0) / $overallSize)
                : $inclusionRate;

            $strategyAffinity = $isOverall
                ? $commanderAffinity
                : $this->strategyAffinity($inclusionRate, $commanderAffinity, $scopeSize);

            $stat = new CommanderCardStat($commanderOracle, $strategyId, $uuid);
            $stat->setDeckCount($row['deckCount'])
                ->setSampleSize($scopeSize)
                ->setInclusionRate($inclusionRate)
                ->setCommanderAffinity($commanderAffinity)
                ->setStrategyAffinity($strategyAffinity)
                ->setAverageQuantity($row['quantity'] / max(1, $row['deckCount']))
                // Candidate generation orders by this, so it blends "played
                // here" with "specific to here" and stays strategy-aware.
                ->setBaseScore((0.4 * $inclusionRate) + (0.6 * $strategyAffinity))
                ->setConfidence($confidence);

            $this->em->persist($stat);
            ++$written;
            if (0 === $written % self::FLUSH_EVERY) {
                $this->em->flush();
            }
        }

        $this->em->flush();

        return $written;
    }

    /**
     * How much this card belongs to this strategy specifically, as opposed to
     * being something the commander plays regardless.
     *
     * Raw inclusion rate cannot answer that on its own: Sol Ring is in ~100% of
     * a commander's token decks *and* ~100% of its counters decks. Lift against
     * the commander's own baseline separates the two — a card played twice as
     * often inside the strategy as outside it is genuinely a strategy card,
     * while a universal staple has a lift of 1.0 and earns nothing from it.
     *
     * Inclusion still carries weight, because a strategy card nobody plays is
     * not a good recommendation either.
     */
    private function strategyAffinity(float $inclusionRate, float $commanderAffinity, int $scopeSize): float
    {
        // Floor the baseline at one deck's worth so a card unique to this
        // strategy does not divide by zero into infinite lift.
        $baseline = max($commanderAffinity, 1.0 / max(2, $scopeSize + 1));
        $lift = $inclusionRate / $baseline;
        // Lift 1.0 (no preference) scores 0; lift 2.0 or better saturates.
        $liftScore = max(0.0, min(1.0, $lift - 1.0));

        return max(0.0, min(1.0, (0.45 * $inclusionRate) + (0.55 * $liftScore)));
    }

    private function isNoise(int $deckCount, int $scopeSize): bool
    {
        return $scopeSize >= self::LARGE_SAMPLE_THRESHOLD
            && $deckCount < self::MIN_DECK_COUNT_FOR_LARGE_SAMPLE;
    }

    /**
     * Confidence scales with sample size, so a three-deck sample is visibly
     * weaker than a ten-deck one rather than silently presented as equivalent.
     *
     * Provenance is folded in as well. A label a builder wrote on their own deck
     * is stronger evidence than one we inferred from card text, so an inferred
     * strategy is discounted even when it covers more decks — otherwise a loose
     * text match across every deck would outrank the archetype the deck's author
     * actually named.
     */
    private function confidenceFor(int $sampleSize, string $source = CommanderStrategyStat::SOURCE_PROVIDER): float
    {
        if ($sampleSize < 1) {
            return 0.0;
        }

        $bySample = min(1.0, $sampleSize / self::CONFIDENT_SAMPLE_SIZE);
        $byProvenance = CommanderStrategyStat::SOURCE_PROVIDER === $source ? 1.0 : 0.7;

        return $bySample * $byProvenance;
    }

    /**
     * Whether a strategy label came from a deck's own tags or was inferred from
     * its composition.
     *
     * Derived by re-normalizing the provider tags we stored verbatim, so the
     * answer is per strategy rather than per deck. Asking only "did this deck
     * have tags?" would mark every strategy on a tagged deck as provider-sourced
     * — including ones we inferred ourselves — and inferred labels are looser,
     * so that mislabelling would let a broad text match outrank the archetype
     * the author actually named.
     *
     * @param list<ReferenceDeck> $decks
     */
    private function strategySource(array $decks, string $strategyId): string
    {
        foreach ($decks as $deck) {
            if (!$deck->hasStrategy($strategyId)) {
                continue;
            }
            if (in_array($strategyId, $this->taxonomy->normalizeTags($deck->getProviderTags()), true)) {
                return CommanderStrategyStat::SOURCE_PROVIDER;
            }
        }

        return CommanderStrategyStat::SOURCE_CLASSIFIER;
    }

    /** @return list<string> */
    private function providerNames(): array
    {
        if (method_exists($this->deckProvider, 'availableProviderNames')) {
            /** @var list<string> $names */
            $names = $this->deckProvider->availableProviderNames();

            return $names;
        }

        return $this->deckProvider->isAvailable() ? [$this->deckProvider->name()] : [];
    }

    private function toUuid(string $value): ?Uuid
    {
        try {
            return Uuid::fromString($value);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }
}
