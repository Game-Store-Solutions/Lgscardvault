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

        $complete = [
            'id' => 'test-combo-complete',
            'status' => 'OK',
            'identity' => 'WUBG',
            'description' => 'Two-card proliferate loop fully stocked.',
            'uses' => [
                [
                    'card' => ['name' => $needle, 'identity' => 'WUBG'],
                    'quantity' => 1,
                ],
                [
                    'card' => ['name' => 'Proliferate Buddy', 'identity' => 'U'],
                    'quantity' => 1,
                ],
            ],
            'produces' => [
                ['feature' => ['name' => 'Infinite proliferate'], 'quantity' => 1],
            ],
        ];

        $partial = [
            'id' => 'test-combo-1',
            'status' => 'OK',
            'identity' => 'WUBG',
            'description' => 'Test infinite proliferate loop.',
            'uses' => [
                [
                    'card' => ['name' => $needle, 'identity' => 'WUBG'],
                    'quantity' => 1,
                ],
                [
                    'card' => ['name' => 'Proliferate Buddy', 'identity' => 'U'],
                    'quantity' => 1,
                ],
                [
                    'card' => ['name' => 'Missing Combo Piece', 'identity' => 'C'],
                    'quantity' => 1,
                ],
            ],
            'produces' => [
                ['feature' => ['name' => 'Infinite proliferate'], 'quantity' => 1],
            ],
        ];

        $illegal = [
            'id' => 'test-combo-illegal',
            'status' => 'OK',
            'identity' => 'WUBRG',
            'description' => 'Illegal outside Atraxa identity.',
            'uses' => [
                [
                    'card' => ['name' => $needle, 'identity' => 'WUBG'],
                    'quantity' => 1,
                ],
                [
                    'card' => ['name' => 'Lightning Bolt', 'identity' => 'R'],
                    'quantity' => 1,
                ],
            ],
            'produces' => [
                ['feature' => ['name' => 'Damage'], 'quantity' => 1],
            ],
        ];

        $emptyStock = [
            'id' => 'test-combo-empty',
            'status' => 'OK',
            'identity' => 'U',
            'description' => 'No store pieces besides the commander.',
            'uses' => [
                [
                    'card' => ['name' => $needle, 'identity' => 'WUBG'],
                    'quantity' => 1,
                ],
                [
                    'card' => ['name' => 'Ghostly Completely Missing', 'identity' => 'U'],
                    'quantity' => 1,
                ],
            ],
            'produces' => [
                ['feature' => ['name' => 'Draw'], 'quantity' => 1],
            ],
        ];

        return array_slice([$complete, $partial, $emptyStock, $illegal], 0, max(1, $pageSize));
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
