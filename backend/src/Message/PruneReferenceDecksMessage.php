<?php

namespace App\Message;

/**
 * Drop stale reference decklists whose aggregates have already settled.
 *
 * Scheduled after the weekly intelligence sweep so re-harvested commanders keep
 * a fresh membership matrix and only orphans / abandoned lists are removed.
 */
final class PruneReferenceDecksMessage
{
    public function __construct(
        public readonly int $batchSize = 500,
    ) {
    }
}
