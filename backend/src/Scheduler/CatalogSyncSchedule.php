<?php

namespace App\Scheduler;

use App\Message\SyncGameCatalogMessage;
use App\Repository\GameRepository;
use Symfony\Component\Scheduler\Attribute\AsSchedule;
use Symfony\Component\Scheduler\RecurringMessage;
use Symfony\Component\Scheduler\Schedule;
use Symfony\Component\Scheduler\ScheduleProviderInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Keeps every game's catalog current without anyone pressing a button.
 *
 * TCGCSV republishes the TCGplayer catalog once a day at 20:00 UTC, so a
 * sync is queued for each active game shortly after — new sets, new cards,
 * new sealed products, and fresh prices land on their own. Games are read
 * from the database, so enabling a game (or adding one) puts it on the
 * schedule with no code change.
 *
 * Run it with:
 *   php bin/console messenger:consume scheduler_catalog
 * (the dispatched messages themselves are handled by the `async` worker).
 */
#[AsSchedule('catalog')]
final readonly class CatalogSyncSchedule implements ScheduleProviderInterface
{
    /** Half an hour after TCGCSV's daily refresh, so the mirror is settled. */
    private const DAILY_RUN_TIME = '20:30 UTC';

    /**
     * Gap between games. Each sync is thousands of paced requests; starting
     * them all at once would put five concurrent crawlers on a free service
     * (and five long-running jobs on the worker) for no benefit.
     */
    private const STAGGER_MINUTES = 20;

    public function __construct(
        private GameRepository $games,
        private CacheInterface $cache,
    ) {
    }

    public function getSchedule(): Schedule
    {
        $schedule = (new Schedule())
            // Survives restarts: a worker that was down at 20:30 still runs
            // the missed sync when it comes back instead of skipping a day.
            ->stateful($this->cache);

        $slot = 0;
        foreach ($this->games->findActive() as $game) {
            if (null === $game->getTcgcsvCategoryId()) {
                continue;
            }

            $startsAt = (new \DateTimeImmutable(self::DAILY_RUN_TIME))
                ->modify(sprintf('+%d minutes', $slot * self::STAGGER_MINUTES));
            ++$slot;

            $schedule->add(
                RecurringMessage::every(
                    '1 day',
                    new SyncGameCatalogMessage($game->getCode()),
                    from: $startsAt,
                ),
            );
        }

        return $schedule;
    }
}
