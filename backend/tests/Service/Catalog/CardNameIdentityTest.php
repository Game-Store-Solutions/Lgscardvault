<?php

namespace App\Tests\Service\Catalog;

use App\Service\Catalog\CardNameIdentity;
use PHPUnit\Framework\TestCase;

final class CardNameIdentityTest extends TestCase
{
    /** @return list<array{0: string, 1: string}> */
    public static function onePieceNames(): array
    {
        return [
            ['Shanks', 'Shanks'],
            ['Shanks (OP04) (Manga)', 'Shanks'],
            ['Shanks (022) (Manga)', 'Shanks'],
            ['Shanks (Championship 2023) [Serial Number]', 'Shanks'],
            ['Shanks - OP09-004 (Gold)', 'Shanks'],
            ['Shanks - OP09-004 (Silver)', 'Shanks'],
            ['Nami (Manga)', 'Nami'],
        ];
    }

    /** @dataProvider onePieceNames */
    public function testStripsTcgplayerSetAndTreatmentSuffixes(string $product, string $identity): void
    {
        self::assertSame($identity, CardNameIdentity::baseName($product));
    }

    public function testLeavesDistinctCardNamesAlone(): void
    {
        self::assertSame('Pikachu V', CardNameIdentity::baseName('Pikachu V'));
        self::assertSame('Monkey D. Luffy', CardNameIdentity::baseName('Monkey D. Luffy'));
        self::assertTrue(CardNameIdentity::matches('Shanks (OP04) (Manga)', 'Shanks - OP09-004 (Gold)'));
        self::assertFalse(CardNameIdentity::matches('Shanks', 'Shanks Twin'));
    }
}
