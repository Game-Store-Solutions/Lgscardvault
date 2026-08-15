<?php

namespace App\Service\Recovery;

use App\Entity\Game;

/**
 * One failed-row search request: what the operator typed plus the filters the
 * CSV row contributed. Immutable — the finder derives relaxed copies of it as
 * it walks down the ladder.
 */
final readonly class RecoveryQuery
{
    public function __construct(
        public Game $game,
        public string $name,
        public string $setCode = '',
        public string $collectorNumber = '',
        public string $rarity = '',
        public string $finish = '',
    ) {
    }

    public function withoutCollectorAndRarity(): self
    {
        return new self($this->game, $this->name, $this->setCode, '', '', $this->finish);
    }

    public function withoutSet(): self
    {
        return new self($this->game, $this->name, '', '', '', $this->finish);
    }

    public function isMagic(): bool
    {
        return $this->game->isMtg();
    }

    /** Stable identity for per-request memoisation. */
    public function cacheKey(): string
    {
        return implode('|', [
            $this->game->getCode(),
            mb_strtolower($this->name),
            $this->setCode,
            $this->collectorNumber,
            $this->rarity,
            $this->finish,
        ]);
    }
}
