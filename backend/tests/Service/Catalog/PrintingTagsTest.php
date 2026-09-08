<?php

namespace App\Tests\Service\Catalog;

use App\Service\Catalog\PrintingTags;
use PHPUnit\Framework\TestCase;

final class PrintingTagsTest extends TestCase
{
    public function testCollectsShowcaseInvertedBoosterFunAndLegendary(): void
    {
        $tags = PrintingTags::collect('Legendary Instant', [
            'frame_effects' => ['showcase', 'inverted', 'legendary'],
            'promo_types' => ['boosterfun', 'setpromo'],
        ]);

        self::assertSame(['Showcase', 'Inverted', 'Booster Fun', 'Legendary'], $tags);
    }

    public function testIgnoresNoisyPromoTypesAndDedupes(): void
    {
        $tags = PrintingTags::collect('Creature — Human', [
            'frame_effects' => ['showcase', 'showcase'],
            'promo_types' => ['setpromo', 'fnm', 'buyabox'],
            'full_art' => true,
            'border_color' => 'borderless',
        ]);

        self::assertSame(['Showcase', 'Full Art', 'Borderless'], $tags);
    }

    public function testEmptyPayloadYieldsNoTags(): void
    {
        self::assertSame([], PrintingTags::collect(null, null));
        self::assertSame([], PrintingTags::collect('Instant', []));
        self::assertSame([], PrintingTags::fromCard(null));
    }
}
