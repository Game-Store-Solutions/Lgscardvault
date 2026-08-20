<?php

namespace App\Tests\Service\Recommend;

use App\Service\Recommend\Intelligence\SynergyEngine;
use PHPUnit\Framework\TestCase;

/**
 * The distinction this engine exists to make: cards that genuinely belong
 * together versus cards that are merely both popular.
 */
final class SynergyEngineTest extends TestCase
{
    private const A = 'aaaaaaaa-0000-4000-8000-000000000001';
    private const B = 'bbbbbbbb-0000-4000-8000-000000000002';
    private const STAPLE = 'cccccccc-0000-4000-8000-000000000003';
    private const LONER = 'dddddddd-0000-4000-8000-000000000004';

    public function testUniversalStapleHasNoRelationshipWithAnything(): void
    {
        $engine = $this->sample();

        // The staple is in every deck, so it co-occurs with A every single time
        // A is played — the highest count any partner of A could possibly have.
        // Counting raw co-occurrence would therefore make it the best partner
        // for every card in the format. Lift correctly reports no relationship,
        // because the staple's presence predicts nothing.
        self::assertSame(2, $engine->coOccurrenceCount(self::STAPLE, self::A));
        self::assertSame(2, $engine->coOccurrenceCount(self::A, self::B));
        self::assertSame(0.0, $engine->relationshipStrength(self::STAPLE, self::A));
        self::assertSame(1.0, $engine->inclusionRate(self::STAPLE));
    }

    public function testCardsThatTravelTogetherShowARelationship(): void
    {
        $engine = $this->sample();

        // A and B each appear in half the decks but always in the same half, so
        // they co-occur twice as often as their individual rates predict.
        self::assertSame(0.5, $engine->inclusionRate(self::A));
        self::assertSame(0.5, $engine->inclusionRate(self::B));
        self::assertGreaterThan(0.0, $engine->relationshipStrength(self::A, self::B));
    }

    public function testSingleSharedDeckIsTreatedAsCoincidence(): void
    {
        $engine = new SynergyEngine([
            [self::A, self::B],
            [self::A, self::LONER],
            [self::A, self::LONER],
            [self::A, self::LONER],
        ]);

        self::assertSame(1, $engine->coOccurrenceCount(self::A, self::B));
        self::assertSame(
            0.0,
            $engine->relationshipStrength(self::A, self::B),
            'one shared deck is not evidence of a relationship',
        );
    }

    public function testStrongerSupportBeatsWeakerSupportAtEqualLift(): void
    {
        $wide = new SynergyEngine([
            [self::A, self::B], [self::A, self::B], [self::A, self::B], [self::A, self::B],
            [self::LONER], [self::LONER], [self::LONER], [self::LONER],
        ]);
        $narrow = new SynergyEngine([
            [self::A, self::B], [self::A, self::B],
            [self::LONER], [self::LONER], [self::LONER], [self::LONER], [self::LONER], [self::LONER],
        ]);

        self::assertGreaterThan(
            $narrow->relationshipStrength(self::A, self::B),
            $wide->relationshipStrength(self::A, self::B),
            'a pattern seen in four decks should outrank the same pattern seen in two',
        );
    }

    public function testDeckSynergyRewardsBreadthOfConnection(): void
    {
        $engine = $this->sample();

        $connected = $engine->synergyWithDeck(self::A, [self::B]);
        $unconnected = $engine->synergyWithDeck(self::A, [self::LONER]);

        self::assertGreaterThan(0.0, $connected['score']);
        self::assertNotEmpty($connected['partners']);
        self::assertSame(0.0, $unconnected['score']);
        self::assertSame([], $unconnected['partners']);
    }

    public function testEmptySampleYieldsNoSignalRatherThanGuesses(): void
    {
        $engine = new SynergyEngine();

        self::assertFalse($engine->hasData());
        self::assertSame(0, $engine->sampleSize());
        self::assertSame(0.0, $engine->relationshipStrength(self::A, self::B));
        self::assertSame(0.0, $engine->synergyWithDeck(self::A, [self::B])['score']);
    }

    public function testCardIsNotItsOwnPartner(): void
    {
        self::assertSame(0.0, $this->sample()->relationshipStrength(self::A, self::A));
    }

    /**
     * Four decks: A and B always together in two of them, a staple in all four,
     * and an unrelated card in the other two.
     */
    private function sample(): SynergyEngine
    {
        return new SynergyEngine([
            [self::A, self::B, self::STAPLE],
            [self::A, self::B, self::STAPLE],
            [self::LONER, self::STAPLE],
            [self::LONER, self::STAPLE],
        ]);
    }
}
