<?php

namespace App\Service\Recovery;

use App\Entity\Card;

/**
 * The outcome of one recovery search.
 *
 * `rejected` is deliberately not thrown away: an Alchemy row whose only hits
 * are digital printings should show those printings greyed out with the reason
 * rather than an empty list, because "nothing found" and "found, but you can
 * not stock it" are very different problems for the operator.
 */
final readonly class RecoveryResult
{
    /**
     * @param list<Card>                              $items    stockable printings, best first
     * @param list<array{card: Card, reason: string}> $rejected online-only printings and why
     * @param list<string>                            $relaxed  filters dropped to get here
     */
    public function __construct(
        public array $items = [],
        public array $rejected = [],
        public array $relaxed = [],
    ) {
    }

    public function isEmpty(): bool
    {
        return [] === $this->items;
    }
}
