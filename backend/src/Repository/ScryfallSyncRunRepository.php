<?php

namespace App\Repository;

use App\Entity\ScryfallSyncRun;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ScryfallSyncRun>
 */
class ScryfallSyncRunRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ScryfallSyncRun::class);
    }

    /** @return list<ScryfallSyncRun> newest first */
    public function findRecent(int $limit = 50): array
    {
        return $this->findBy([], ['startedAt' => 'DESC', 'id' => 'DESC'], $limit);
    }

    /**
     * Marks abandoned runs as failed.
     *
     * Running jobs use heartbeat age. Queued jobs use startedAt only, with a
     * longer grace period — messengers can sit behind CSV / other syncs.
     *
     * @return int number of runs reaped
     */
    public function failStaleRuns(\DateTimeImmutable $runningThreshold, \DateTimeImmutable $queuedThreshold): int
    {
        $failedRunning = (int) $this->createQueryBuilder('r')
            ->update()
            ->set('r.status', ':failed')
            ->set('r.finishedAt', ':now')
            ->set('r.error', ':error')
            ->andWhere('r.status = :running')
            ->andWhere('COALESCE(r.heartbeatAt, r.startedAt) < :runningThreshold')
            ->setParameter('failed', ScryfallSyncRun::STATUS_FAILED)
            ->setParameter('running', ScryfallSyncRun::STATUS_RUNNING)
            ->setParameter('now', new \DateTimeImmutable())
            ->setParameter('error', 'Interrupted: the worker stopped responding (crash, restart, or out of memory).')
            ->setParameter('runningThreshold', $runningThreshold)
            ->getQuery()
            ->execute();

        $failedQueued = (int) $this->createQueryBuilder('r')
            ->update()
            ->set('r.status', ':failed')
            ->set('r.finishedAt', ':now')
            ->set('r.error', ':error')
            ->andWhere('r.status = :queued')
            ->andWhere('r.startedAt < :queuedThreshold')
            ->setParameter('failed', ScryfallSyncRun::STATUS_FAILED)
            ->setParameter('queued', ScryfallSyncRun::STATUS_QUEUED)
            ->setParameter('now', new \DateTimeImmutable())
            ->setParameter('error', 'Interrupted: the job stayed queued too long without a worker picking it up.')
            ->setParameter('queuedThreshold', $queuedThreshold)
            ->getQuery()
            ->execute();

        return $failedRunning + $failedQueued;
    }
}
