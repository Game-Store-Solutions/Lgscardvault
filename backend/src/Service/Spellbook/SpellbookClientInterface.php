<?php

namespace App\Service\Spellbook;

interface SpellbookClientInterface
{
    /**
     * Variants that include any of the given card names (commander-seeded discovery).
     *
     * @param list<string> $cardNames
     * @return list<array<string, mixed>>
     */
    public function searchVariants(array $cardNames, int $pageSize = 24): array;

    /**
     * Combos fully or almost included in a deck list.
     *
     * @param list<string> $mainNames
     * @param list<string> $commanderNames
     * @return array{
     *   identity: string|null,
     *   included: list<array<string, mixed>>,
     *   almostIncluded: list<array<string, mixed>>
     * }
     */
    public function findMyCombos(array $mainNames, array $commanderNames = []): array;
}
