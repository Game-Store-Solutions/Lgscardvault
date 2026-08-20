<?php

namespace App\Tests\Service\Catalog;

use App\Service\Catalog\ArtistCredits;
use PHPUnit\Framework\TestCase;

final class ArtistCreditsTest extends TestCase
{
    public function testCollectsTopLevelAndFaceCreditsUniquelyLowercased(): void
    {
        $credits = ArtistCredits::collect('Brian Snoddy', [
            'artist' => 'Brian Snoddy',
            'card_faces' => [
                ['name' => 'Front', 'artist' => 'Chris Rahn'],
                ['name' => 'Back', 'artist' => 'CHRIS RAHN'],
                ['name' => 'No credit'],
            ],
        ]);

        sort($credits);
        self::assertSame(['brian snoddy', 'chris rahn'], $credits);
    }

    public function testEmptyInputYieldsNoCredits(): void
    {
        self::assertSame([], ArtistCredits::collect(null, null));
        self::assertSame([], ArtistCredits::collect('  ', ['artist' => '']));
        self::assertNull(ArtistCredits::containsParam('   '));
    }

    public function testContainsParamIsAJsonStringScalar(): void
    {
        self::assertSame('"chris rahn"', ArtistCredits::containsParam('  Chris Rahn  '));
    }
}
