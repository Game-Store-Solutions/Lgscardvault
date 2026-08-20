<?php

namespace App\Scheduler;

use App\Message\PruneReferenceDecksMessage;
use App\Message\RefreshStaleCommanderIntelligenceMessage;
use App\Message\SyncCommanderCatalogMessage;
use Symfony\Component\Scheduler\Attribute\AsSchedule;
use Symfony\Component\Scheduler\RecurringMessage;
use Symfony\Component\Scheduler\Schedule;
use Symfony\Component\Scheduler\ScheduleProviderInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Weekly commander maintenance:
 *
 *  - refresh every Scryfall-legal commander into the local `commanders` table
 *    so typeahead never hits Scryfall at request time;
 *  - sweep for commanders whose reference-deck statistics have gone stale and
 *    queue a bounded batch of intelligence refreshes;
 *  - prune orphaned reference decklists once aggregates have settled.
 *
 * Run the ticker with:
 *   php bin/console messenger:consume scheduler_commanders
 * (the dispatched messages are handled by the `async` worker).
 */
#[AsSchedule('commanders')]
final readonly class CommanderCatalogSchedule implements ScheduleProviderInterface
{
    /** Sunday 06:00 UTC — off the daily TCGCSV/catalog peak. */
    private const WEEKLY_RUN_TIME = 'Sunday 06:00 UTC';

    /**
     * Two hours after the catalog sync, so newly legal commanders already exist
     * when the sweep looks for stale statistics.
     */
    private const WEEKLY_INTELLIGENCE_TIME = 'Sunday 08:00 UTC';

    /**
     * After the intelligence sweep has re-touched active commanders, drop lists
     * whose fetchedAt never got refreshed (orphans / abandoned commanders).
     */
    private const WEEKLY_PRUNE_TIME = 'Sunday 10:00 UTC';

    public function __construct(
        private CacheInterface $cache,
    ) {
    }

    public function getSchedule(): Schedule
    {
        return (new Schedule())
            ->stateful($this->cache)
            ->add(RecurringMessage::every(
                '1 week',
                new SyncCommanderCatalogMessage(),
                from: new \DateTimeImmutable(self::WEEKLY_RUN_TIME),
            ))
            ->add(RecurringMessage::every(
                '1 week',
                new RefreshStaleCommanderIntelligenceMessage(),
                from: new \DateTimeImmutable(self::WEEKLY_INTELLIGENCE_TIME),
            ))
            ->add(RecurringMessage::every(
                '1 week',
                new PruneReferenceDecksMessage(),
                from: new \DateTimeImmutable(self::WEEKLY_PRUNE_TIME),
            ));
    }
}
