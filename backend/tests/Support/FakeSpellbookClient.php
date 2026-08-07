<?php

namespace App\Tests\Support;

use App\Service\Spellbook\SpellbookClientInterface;

/**
 * Deterministic Spellbook stand-in — no network in the test suite.
 */
final class FakeSpellbookClient implements SpellbookClientInterface
{
    public function searchVariants(array $cardNames, int $pageSize = 24): array
    {
        $needle = null;
        foreach ($cardNames as $name) {
            if (str_contains(strtolower((string) $name), 'atraxa')) {
                $needle = 'Atraxa Test';
                break;
            }
            if (str_contains(strtolower((string) $name), 'kiki')) {
                $needle = 'Kiki-Jiki, Mirror Breaker';
                break;
            }
        }
        if (null === $needle) {
            return [];
        }

        return [
            [
                'id' => 'test-combo-1',
                'status' => 'OK',
                'description' => 'Test infinite proliferate loop.',
                'uses' => [
                    [
                        'card' => ['name' => $needle, 'oracleId' => null],
                        'quantity' => 1,
                    ],
                    [
                        'card' => ['name' => 'Proliferate Buddy', 'oracleId' => null],
                        'quantity' => 1,
                    ],
                    [
                        'card' => ['name' => 'Missing Combo Piece', 'oracleId' => null],
                        'quantity' => 1,
                    ],
                ],
                'produces' => [
                    ['feature' => ['name' => 'Infinite proliferate'], 'quantity' => 1],
                ],
            ],
        ];
    }

    public function findMyCombos(array $mainNames, array $commanderNames = []): array
    {
        $variants = $this->searchVariants([...$commanderNames, ...$mainNames]);
        $haystack = array_map('strtolower', [...$mainNames, ...$commanderNames]);
        $included = [];
        $almost = [];
        foreach ($variants as $variant) {
            $needed = [];
            foreach ($variant['uses'] ?? [] as $use) {
                $needed[] = strtolower((string) ($use['card']['name'] ?? ''));
            }
            $have = 0;
            foreach ($needed as $n) {
                if (in_array($n, $haystack, true)) {
                    ++$have;
                }
            }
            if ($have === count($needed) && count($needed) > 0) {
                $included[] = $variant;
            } elseif ($have > 0) {
                $almost[] = $variant;
            }
        }

        return [
            'identity' => 'WUBG',
            'included' => $included,
            'almostIncluded' => $almost,
        ];
    }
}
