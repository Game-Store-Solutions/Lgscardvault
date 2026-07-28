<?php

namespace App\Service\Doctrine;

use Symfony\Bridge\Doctrine\Middleware\Debug\DebugDataHolder;

/**
 * Drops the SQL statements Doctrine collects for the profiler.
 *
 * In debug mode (the default for `dev`, including CLI commands) every query
 * is retained in memory — with a full backtrace when
 * `profiling_collect_backtrace` is on. That is fine for a web request that
 * runs a few dozen queries and exits, but a catalog sync or a 50k-row CSV
 * import runs tens of thousands of queries in one process and the collected
 * data alone exhausts the default 128M memory_limit:
 *
 *   PHP Fatal error: Allowed memory size of 134217728 bytes exhausted
 *   in .../Middleware/BacktraceDebugDataHolder.php
 *
 * Long-running work calls prune() between batches so that buffer can never
 * grow without bound. In prod the profiler is off and the service is absent,
 * so this is a no-op.
 */
final readonly class SqlDebugLogPruner
{
    public function __construct(
        private ?DebugDataHolder $debugDataHolder = null,
    ) {
    }

    public function prune(): void
    {
        $this->debugDataHolder?->reset();
    }
}
