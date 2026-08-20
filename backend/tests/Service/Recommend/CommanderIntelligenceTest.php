<?php

namespace App\Tests\Service\Recommend;

use App\Entity\Card;
use App\Entity\Store;
use App\Service\Recommend\CommanderRecommender;
use App\Service\Recommend\Intelligence\CommanderIntelligence;
use App\Service\Recommend\Intelligence\CommanderIntelligenceRefresher;
use App\Service\Recommend\Intelligence\RecommendationWeights;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\CommanderIntelligenceFixtures;
use App\Tests\Support\FakeArchidektClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * The behavioural contract of the recommendation engine.
 *
 * These tests are written against outcomes a player would notice — "picking
 * Tokens gives me a different deck than picking +1/+1 Counters" — rather than
 * against internal weights, so re-tuning the model does not break them but
 * breaking the model does.
 */
final class CommanderIntelligenceTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $catalog;
    private CommanderIntelligenceFixtures $scenario;
    private FakeArchidektClient $archidekt;
    private CommanderRecommender $recommender;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->catalog = new CatalogFixtures($this->em);
        $this->archidekt = $c->get(FakeArchidektClient::class);
        $this->archidekt->reset();
        $this->recommender = $c->get(CommanderRecommender::class);
        $this->scenario = new CommanderIntelligenceFixtures(
            $this->em,
            $this->catalog,
            $this->archidekt,
            $c->get(CommanderIntelligenceRefresher::class),
        );
    }

    public function testWeightsRejectUnknownKeysSoAConfigTypoFailsLoudly(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        new RecommendationWeights(['strategy_affinty' => 0.5]);
    }

    public function testWeightsEncodeTheDesignedHierarchy(): void
    {
        /** @var RecommendationWeights $weights */
        $weights = static::getContainer()->get(RecommendationWeights::class);

        $strategy = $weights->get(RecommendationWeights::STRATEGY_AFFINITY);
        $popularity = $weights->get(RecommendationWeights::POPULARITY);
        $commander = $weights->get(RecommendationWeights::COMMANDER_AFFINITY);

        self::assertGreaterThan(
            $popularity + $commander,
            $strategy,
            'strategy fit must outweigh generic popularity and commander-wide play rate combined',
        );
        self::assertGreaterThan(
            $popularity,
            $weights->get(RecommendationWeights::EXISTING_DECK_SYNERGY),
            'what the deck already contains must matter more than popularity',
        );
    }

    public function testDifferentStrategiesForSameCommanderProduceDifferentRecommendations(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $tokens = $this->topNames($store, $commander, CommanderIntelligenceFixtures::TOKENS_STRATEGY, 4);
        $counters = $this->topNames($store, $commander, CommanderIntelligenceFixtures::COUNTERS_STRATEGY, 4);

        self::assertNotSame($tokens, $counters, 'the two strategies must not return the same ranking');
        self::assertContains('Token Doubler Test', $tokens);
        self::assertContains('Tremor Payoff Test', $tokens);
        self::assertContains('Counter Placer Test', $counters);
        self::assertNotContains(
            'Counter Placer Test',
            $tokens,
            'a counters-only card should not lead a tokens build',
        );
    }

    public function testGenericStaplesDoNotOverpowerStrategyCards(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $rows = $this->indexByName(
            $this->recommender->recommendForStore($store, $commander, CommanderIntelligenceFixtures::TOKENS_STRATEGY, 40),
        );

        $staple = $rows['Generic Staple Test'] ?? null;
        $strategyCard = $rows['Token Doubler Test'] ?? null;
        self::assertNotNull($staple, 'the staple is legal and stocked, so it should still be recommended');
        self::assertNotNull($strategyCard);

        // The staple is EDHREC #1 and appears in every single reference deck, so
        // popularity and raw frequency both favour it. Only strategy specificity
        // should tip the balance.
        self::assertSame(1, $staple['card']['edhrecRank']);
        self::assertGreaterThan(
            $staple['score'],
            $strategyCard['score'],
            'a strategy-defining card must outrank the most popular card in the format',
        );
        self::assertGreaterThan(
            $staple['scoreBreakdown'][RecommendationWeights::STRATEGY_AFFINITY],
            $strategyCard['scoreBreakdown'][RecommendationWeights::STRATEGY_AFFINITY],
            'lift against the commander baseline should separate a strategy card from a universal staple',
        );
    }

    public function testExplanationsComeFromTheScoringProcess(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $rows = $this->indexByName(
            $this->recommender->recommendForStore($store, $commander, CommanderIntelligenceFixtures::TOKENS_STRATEGY, 40),
        );
        $doubler = $rows['Token Doubler Test'];

        self::assertNotEmpty($doubler['reasons']);
        // Every reason must be backed by a scored term, which is what stops
        // explanations drifting away from the numbers behind them.
        self::assertArrayHasKey(RecommendationWeights::STRATEGY_AFFINITY, $doubler['scoreBreakdown']);
        self::assertArrayHasKey(RecommendationWeights::REFERENCE_FREQUENCY, $doubler['scoreBreakdown']);

        $joined = implode(' | ', $doubler['reasons']);
        self::assertStringContainsString('5/5', $joined, 'inclusion in the strategy sample should be explained');
        self::assertStringContainsString('Tokens', $joined);
    }

    public function testExistingDeckContentsChangeRecommendations(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $empty = $this->indexByName(
            $this->recommender->recommendForStore($store, $commander, CommanderIntelligenceFixtures::TOKENS_STRATEGY, 40),
        );

        // A deck with generators and doublers but no payoff.
        $deck = [
            CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::TOKEN_GENERATOR),
            CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::TOKEN_MULTIPLIER),
            CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::TOKEN_MULTIPLIER_TWO),
        ];
        $withDeck = $this->indexByName($this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            40,
            $deck,
        ));

        self::assertArrayNotHasKey(
            'Token Doubler Test',
            $withDeck,
            'cards already in the deck must not be recommended again',
        );

        $payoffBefore = $empty['Tremor Payoff Test']['score'];
        $payoffAfter = $withDeck['Tremor Payoff Test']['score'];
        self::assertGreaterThan(
            $payoffBefore,
            $payoffAfter,
            'a payoff should become more valuable once generators and doublers are down',
        );
        self::assertGreaterThan(
            0.0,
            $withDeck['Tremor Payoff Test']['scoreBreakdown'][RecommendationWeights::EXISTING_DECK_SYNERGY],
            'co-occurrence with the current deck must contribute',
        );
    }

    public function testCardRelationshipsRequireRealCoOccurrenceNotJustPopularity(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        // Counters cards never share a deck with tokens cards in this sample, so
        // a tokens deck must produce no relationship signal for them even though
        // both appear under the same commander.
        $deck = [
            CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::TOKEN_GENERATOR),
            CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::TOKEN_MULTIPLIER),
        ];
        $rows = $this->indexByName($this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            40,
            $deck,
        ));

        self::assertGreaterThan(
            0.0,
            $rows['Tremor Payoff Test']['scoreBreakdown'][RecommendationWeights::EXISTING_DECK_SYNERGY],
            'a card that really does share decks with these cards should show synergy',
        );
        self::assertSame(
            0.0,
            $rows['Counter Placer Test']['scoreBreakdown'][RecommendationWeights::EXISTING_DECK_SYNERGY],
            'no shared decks means no synergy, however popular both cards are',
        );
    }

    public function testIllegalCardsAreNeverRecommended(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $payload = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            120,
        );
        $names = array_column(array_column($payload['recommendations'], 'card'), 'name');

        self::assertNotContains('Blue Interloper Test', $names, 'outside the commander color identity');
        self::assertNotContains('Banned Token Engine Test', $names, 'banned in Commander');
        self::assertNotContains('Anim Pakal Test', $names, 'the commander is not its own recommendation');
        self::assertNotEmpty($payload['excludedByLegality']);
    }

    public function testCardsWithUnknownLegalityAreRejectedRatherThanAssumedLegal(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $unknown = $this->catalog->card(960, [
            'name' => 'Unsynced Legality Test',
            'type_line' => 'Artifact',
            'oracle_text' => 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
            'color_identity' => [],
            'cmc' => 2,
            // No `legalities` at all — the state a card is in before its
            // legality has been synced.
        ]);
        $this->catalog->inventoryItem($store, $unknown, quantity: 5, priceCents: 100);
        $this->em->flush();

        $payload = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            120,
        );
        $names = array_column(array_column($payload['recommendations'], 'card'), 'name');

        self::assertNotContains(
            'Unsynced Legality Test',
            $names,
            'a card we cannot vouch for must fail closed, not default to legal',
        );
    }

    public function testOutOfStockCardsAreRecommendedAndFlagged(): void
    {
        $store = $this->catalog->store('intel-stock-signal');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];

        // Deliberately stock nothing: the reference decks alone should still
        // produce a usable list, because stock is a signal and not a filter.
        $this->scenario->seedReferenceDecks($commander);

        $payload = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            40,
        );

        self::assertNotEmpty($payload['recommendations'], 'reference data alone must be enough to recommend');
        foreach ($payload['recommendations'] as $row) {
            self::assertFalse($row['inStock']);
            self::assertNull($row['inventoryItem']);
            self::assertContains('Not currently in your inventory', $row['reasons']);
        }
    }

    public function testStockBreaksTiesWithoutReorderingStrategyFit(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $withStock = $this->indexByName($this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            40,
        ));
        $ignoringStock = $this->indexByName($this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            40,
            [],
            false,
        ));

        // Same cards either way here, but the stocked run scores higher.
        self::assertGreaterThan(
            $ignoringStock['Token Doubler Test']['score'] - 0.0001,
            $withStock['Token Doubler Test']['score'],
        );
        self::assertTrue($withStock['Token Doubler Test']['inStock']);
    }

    public function testMissingStrategyDataFallsBackAndReportsLowerConfidence(): void
    {
        $store = $this->catalog->store('intel-fallback');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);

        // No reference decks at all — the bottom of the ladder.
        $cold = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            20,
        );
        self::assertSame(CommanderIntelligence::LEVEL_METADATA, $cold['intelligence']['level']);
        self::assertSame(0.0, $cold['intelligence']['confidence']);
        self::assertFalse($cold['intelligence']['exactMatch']);
        self::assertNotEmpty(
            $cold['recommendations'],
            'with no reference data we must still fall back to card metadata rather than return nothing',
        );

        // Two tokens decks is below the exact-match threshold, so a request for
        // Tokens must degrade rather than pretend the sample is authoritative.
        $this->scenario->seedReferenceDecks($commander, tokenDecks: 2, counterDecks: 5);
        $this->resetIntelligenceCaches();
        $thin = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            20,
        );

        self::assertNotSame(
            CommanderIntelligence::LEVEL_COMMANDER_STRATEGY,
            $thin['intelligence']['level'],
            'a two-deck sample must not be served as an exact strategy match',
        );
        self::assertLessThan(1.0, $thin['intelligence']['confidence']);
    }

    public function testConfidenceRisesWithSampleSize(): void
    {
        $store = $this->catalog->store('intel-confidence');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);

        $this->scenario->seedReferenceDecks($commander, tokenDecks: 3, counterDecks: 1);
        $small = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            10,
        )['intelligence']['confidence'];

        $this->archidekt->reset();
        $this->scenario->seedReferenceDecks($commander, tokenDecks: 8, counterDecks: 1);
        // The provider memoizes per request; a second measurement in the same
        // process has to clear it, exactly as Symfony's resetter does between
        // real requests.
        $this->resetIntelligenceCaches();
        $large = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            10,
        )['intelligence']['confidence'];

        self::assertGreaterThan($small, $large, 'more reference decks must mean more confidence');
    }

    public function testProviderFailureDoesNotBreakRecommendations(): void
    {
        $store = $this->catalog->store('intel-provider-down');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);

        // Provider returns nothing at all, as it would when down, rate-limited,
        // or disabled by configuration.
        $this->archidekt->reset();
        static::getContainer()->get(CommanderIntelligenceRefresher::class)->refresh($commander);

        $payload = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            20,
        );

        self::assertNotEmpty($payload['recommendations']);
        self::assertSame(CommanderIntelligence::LEVEL_METADATA, $payload['intelligence']['level']);
    }

    public function testStrategiesAreDiscoveredFromProviderTags(): void
    {
        [, $commander] = $this->scenarioWithReferenceDecks();

        $strategies = $this->recommender->strategiesFor($commander);
        $byId = [];
        foreach ($strategies as $strategy) {
            $byId[$strategy['id']] = $strategy;
        }

        self::assertArrayHasKey(CommanderIntelligenceFixtures::TOKENS_STRATEGY, $byId);
        self::assertArrayHasKey(CommanderIntelligenceFixtures::COUNTERS_STRATEGY, $byId);
        self::assertSame(5, $byId[CommanderIntelligenceFixtures::TOKENS_STRATEGY]['deckCount']);
        self::assertSame('provider', $byId[CommanderIntelligenceFixtures::TOKENS_STRATEGY]['source']);
        self::assertSame(5, $byId[CommanderIntelligenceFixtures::COUNTERS_STRATEGY]['deckCount']);

        // Builder-authored labels must rank above anything we merely inferred
        // from card text, which is looser and can match a broad theme in decks
        // that are not really about it.
        $sources = array_column($strategies, 'source');
        $lastProvider = array_keys($sources, 'provider', true);
        $firstInferred = array_search('classifier', $sources, true);
        if (false !== $firstInferred && [] !== $lastProvider) {
            self::assertLessThan(
                $firstInferred,
                max($lastProvider),
                'provider-tagged strategies must precede inferred ones',
            );
        }
        self::assertSame(
            'provider',
            $strategies[0]['source'],
            'the picker must lead with a strategy the reference decks are actually tagged with',
        );
        self::assertContains($strategies[0]['id'], [
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            CommanderIntelligenceFixtures::COUNTERS_STRATEGY,
            'aggro',
        ], 'only the tags the fixture decks carry are provider-sourced');
    }

    public function testUnknownStrategyIsRejected(): void
    {
        [$store, $commander] = $this->scenarioWithReferenceDecks();

        $this->expectException(\InvalidArgumentException::class);
        $this->recommender->recommendForStore($store, $commander, 'not-a-real-strategy', 10);
    }

    public function testReferenceDecksAreVerifiedAgainstTheirActualCommander(): void
    {
        $store = $this->catalog->store('intel-commander-verify');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);

        // A deck that merely *contains* our commander in the 99 under a
        // different leader. Archidekt's own search returns these, so dropping
        // them is essential — otherwise the reference pool fills with the wrong
        // archetype entirely.
        $otherCommander = $this->catalog->card(970, [
            'name' => 'Someone Else Test',
            'type_line' => 'Legendary Creature — Angel',
            'color_identity' => ['R', 'W'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $this->em->flush();

        $land = CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::BASIC_LAND);
        $this->archidekt->addDeck(
            deckId: 500,
            commanderName: $commander->getName(),
            commanderOracleIds: [CatalogFixtures::oracleIdFor(970)],
            cards: [
                CatalogFixtures::oracleIdFor(CommanderIntelligenceFixtures::COMMANDER) => 1,
                $land => 98,
            ],
            tags: ['Tokens'],
            viewCount: 999999,
        );
        static::getContainer()->get(CommanderIntelligenceRefresher::class)->refresh($commander);

        $payload = $this->recommender->recommendForStore(
            $store,
            $commander,
            CommanderIntelligenceFixtures::TOKENS_STRATEGY,
            20,
        );

        self::assertSame(
            CommanderIntelligence::LEVEL_METADATA,
            $payload['intelligence']['level'],
            'a deck led by another commander must not count as reference data for this one',
        );
        self::assertSame('Someone Else Test', $otherCommander->getName());
    }

    /**
     * Clear the per-request memo and card cache, which Symfony's service
     * resetter does between real requests but a single test process does not.
     */
    private function resetIntelligenceCaches(): void
    {
        $c = static::getContainer();
        $c->get(\App\Service\Recommend\Intelligence\CommanderIntelligenceProvider::class)->reset();
        $c->get(\App\Service\Recommend\Intelligence\CardProfileIndex::class)->reset();
    }

    /** @return array{0: Store, 1: Card} */
    private function scenarioWithReferenceDecks(): array
    {
        $store = $this->catalog->store();
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);
        $this->scenario->seedReferenceDecks($commander);

        return [$store, $commander];
    }

    /** @return list<string> */
    private function topNames(Store $store, Card $commander, string $strategyId, int $limit): array
    {
        $payload = $this->recommender->recommendForStore($store, $commander, $strategyId, $limit);

        return array_column(array_column($payload['recommendations'], 'card'), 'name');
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, array<string, mixed>>
     */
    private function indexByName(array $payload): array
    {
        $out = [];
        foreach ($payload['recommendations'] as $row) {
            $out[(string) $row['card']['name']] = $row;
        }

        return $out;
    }
}
