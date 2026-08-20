<?php

namespace App\Service\Recommend;

/**
 * Wizards Commander bracket rules as they apply to store-built lists.
 *
 * Game Changer caps:
 *  1 Exhibition / 2 Core — none
 *  3 Upgraded — up to 3
 *  4 Optimized / 5 cEDH — uncapped
 *
 * Auto-bracket is the highest level the store can actually supply for this
 * commander's identity (count of in-stock, color-legal Game Changers).
 */
final class CommanderBracket
{
    public const EXHIBITION = 1;
    public const CORE = 2;
    public const UPGRADED = 3;
    public const OPTIMIZED = 4;
    public const CEDH = 5;

    public static function clamp(?int $bracket): ?int
    {
        if (null === $bracket) {
            return null;
        }
        if ($bracket < self::EXHIBITION || $bracket > self::CEDH) {
            return null;
        }

        return $bracket;
    }

    public static function label(int $bracket): string
    {
        return match ($bracket) {
            self::EXHIBITION => 'Exhibition',
            self::CORE => 'Core',
            self::UPGRADED => 'Upgraded',
            self::OPTIMIZED => 'Optimized',
            self::CEDH => 'cEDH',
            default => 'Core',
        };
    }

    /** Max Game Changers allowed in the 99. PHP_INT_MAX means uncapped. */
    public static function maxGameChangers(int $bracket): int
    {
        return match ($bracket) {
            self::EXHIBITION, self::CORE => 0,
            self::UPGRADED => 3,
            default => \PHP_INT_MAX,
        };
    }

    /**
     * Highest bracket the store can accommodate from Game Changer stock.
     * We never auto-select cEDH (5); that is an explicit shopper choice.
     */
    public static function suggestFromGameChangerCount(int $inStockCount): int
    {
        if ($inStockCount >= 4) {
            return self::OPTIMIZED;
        }
        if ($inStockCount >= 1) {
            return self::UPGRADED;
        }

        return self::CORE;
    }
}
