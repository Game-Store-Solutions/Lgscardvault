<?php

namespace App\Tests\Service\Recommend;

use App\Service\Recommend\Intelligence\StrategyTaxonomy;
use App\Service\Recommend\Provider\Archidekt\ArchidektDeckDataProvider;
use App\Tests\Support\FakeArchidektClient;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

/**
 * Normalization of a community deck source into our own shape.
 *
 * The commander-verification tests matter most: Archidekt's search matches decks
 * that merely *contain* the named card, so trusting the filter would fill the
 * reference pool with the wrong archetype and silently skew every statistic
 * built on top of it.
 */
final class ArchidektDeckDataProviderTest extends TestCase
{
    private const COMMANDER = 'aaaaaaaa-0000-4000-8000-000000000001';
    private const OTHER_COMMANDER = 'bbbbbbbb-0000-4000-8000-000000000002';
    private const CARD = 'cccccccc-0000-4000-8000-000000000003';
    private const MAYBEBOARD_CARD = 'dddddddd-0000-4000-8000-000000000004';
    private const LAND = 'eeeeeeee-0000-4000-8000-000000000005';

    private FakeArchidektClient $client;
    private ArchidektDeckDataProvider $provider;

    protected function setUp(): void
    {
        $this->client = new FakeArchidektClient();
        $this->provider = new ArchidektDeckDataProvider(
            $this->client,
            new StrategyTaxonomy(),
            new NullLogger(),
            enabled: true,
        );
    }

    public function testDisabledProviderMakesNoRequests(): void
    {
        $provider = new ArchidektDeckDataProvider(
            $this->client,
            new StrategyTaxonomy(),
            new NullLogger(),
            enabled: false,
        );
        $this->addDeck(1, [self::COMMANDER]);

        self::assertSame([], $provider->getPopularDecks(self::COMMANDER, 'Test Commander', null, 10));
        self::assertSame(0, $this->client->searchCalls, 'a disabled provider must not touch the network');
    }

    public function testExtractsMainboardAndCommanderByOracleId(): void
    {
        $this->addDeck(1, [self::COMMANDER], tags: ['Tokens']);

        $decks = $this->provider->getPopularDecks(self::COMMANDER, 'Test Commander', null, 10);

        self::assertCount(1, $decks);
        $deck = $decks[0];
        self::assertSame('archidekt', $deck->provider);
        self::assertSame('1', $deck->externalId);
        self::assertSame([self::COMMANDER], $deck->commanderOracleIds);
        self::assertArrayHasKey(self::CARD, $deck->cards);
        self::assertArrayNotHasKey(
            self::MAYBEBOARD_CARD,
            $deck->cards,
            'cards in a category flagged not-in-deck are not part of the list',
        );
        self::assertArrayNotHasKey(
            self::COMMANDER,
            $deck->cards,
            'the commander is not one of the 99',
        );
        self::assertSame(99, $deck->cardCount());
        self::assertTrue($deck->looksLikeCommanderDeck());
        self::assertSame(['Tokens'], $deck->providerTags);
    }

    public function testRejectsDecksLedByADifferentCommander(): void
    {
        // The shape Archidekt actually returns: a deck that runs our commander
        // in the 99 under someone else's leadership.
        $this->client->addDeck(
            deckId: 7,
            commanderName: 'Test Commander',
            commanderOracleIds: [self::OTHER_COMMANDER],
            cards: [self::COMMANDER => 1, self::LAND => 98],
            tags: ['Tokens'],
            viewCount: 999999,
        );

        self::assertSame(
            [],
            $this->provider->getPopularDecks(self::COMMANDER, 'Test Commander', null, 10),
            'a deck led by another commander tells us nothing about this one',
        );
    }

    public function testRejectsBinderListsWithManyCommanders(): void
    {
        $commanders = [self::COMMANDER, self::OTHER_COMMANDER, self::CARD, self::LAND];
        $this->client->addDeck(
            deckId: 8,
            commanderName: 'Test Commander',
            commanderOracleIds: $commanders,
            cards: [self::LAND => 96],
            viewCount: 5000,
        );

        self::assertSame(
            [],
            $this->provider->getPopularDecks(self::COMMANDER, 'Test Commander', null, 10),
            'an "all my commanders" list is not a deck',
        );
    }

    public function testFiltersByStrategyWithoutFetchingDiscardedDecks(): void
    {
        $this->addDeck(1, [self::COMMANDER], tags: ['Tokens']);
        $this->addDeck(2, [self::COMMANDER], tags: ['+1/+1 Counters']);

        $tokens = $this->provider->getDecksForCommanderAndStrategy(
            self::COMMANDER,
            'Test Commander',
            'tokens',
            10,
        );

        self::assertCount(1, $tokens);
        self::assertSame('1', $tokens[0]->externalId);
        self::assertSame(
            1,
            $this->client->deckCalls,
            'the off-strategy deck must be discarded from the cheap summary, not fetched in full',
        );
    }

    public function testProviderTagVariantsNormalizeToTheSameStrategy(): void
    {
        $this->addDeck(1, [self::COMMANDER], tags: ['Counters Matter']);

        self::assertCount(
            1,
            $this->provider->getDecksForCommanderAndStrategy(
                self::COMMANDER,
                'Test Commander',
                'plus-1-plus-1-counters',
                10,
            ),
            '"Counters Matter" and "+1/+1 Counters" describe the same archetype',
        );
    }

    public function testPopularityIsOrderedAndNormalized(): void
    {
        $this->addDeck(1, [self::COMMANDER], viewCount: 100);
        $this->addDeck(2, [self::COMMANDER], viewCount: 50000);

        $decks = $this->provider->getPopularDecks(self::COMMANDER, 'Test Commander', null, 10);

        self::assertSame('2', $decks[0]->externalId, 'the more viewed deck should come first');
        self::assertGreaterThan($decks[1]->popularity, $decks[0]->popularity);
        self::assertLessThanOrEqual(1.0, $decks[0]->popularity);
        self::assertGreaterThanOrEqual(0.0, $decks[1]->popularity);
    }

    public function testUnknownCommanderNameYieldsNothing(): void
    {
        $this->addDeck(1, [self::COMMANDER]);

        self::assertSame([], $this->provider->getPopularDecks(self::COMMANDER, 'Nobody At All', null, 10));
    }

    /** @param list<string> $commanders */
    private function addDeck(int $id, array $commanders, array $tags = [], int $viewCount = 1000): void
    {
        $this->client->addDeck(
            deckId: $id,
            commanderName: 'Test Commander',
            commanderOracleIds: $commanders,
            cards: [self::CARD => 1, self::LAND => 98],
            tags: $tags,
            viewCount: $viewCount,
            categories: [self::LAND => 'Land'],
            maybeboard: [self::MAYBEBOARD_CARD],
        );
    }
}
