<?php

namespace App\Tests\Service\Recommend;

use App\Service\Recommend\CommanderBracket;
use PHPUnit\Framework\TestCase;

final class CommanderBracketTest extends TestCase
{
    public function testSuggestsBracketFromGameChangerStock(): void
    {
        self::assertSame(CommanderBracket::CORE, CommanderBracket::suggestFromGameChangerCount(0));
        self::assertSame(CommanderBracket::UPGRADED, CommanderBracket::suggestFromGameChangerCount(2));
        self::assertSame(CommanderBracket::OPTIMIZED, CommanderBracket::suggestFromGameChangerCount(4));
    }

    public function testGameChangerCaps(): void
    {
        self::assertSame(0, CommanderBracket::maxGameChangers(CommanderBracket::CORE));
        self::assertSame(3, CommanderBracket::maxGameChangers(CommanderBracket::UPGRADED));
        self::assertSame(\PHP_INT_MAX, CommanderBracket::maxGameChangers(CommanderBracket::OPTIMIZED));
    }
}
