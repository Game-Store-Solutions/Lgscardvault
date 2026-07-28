<?php

namespace App\Repository;

use App\Entity\CatalogSyncRun;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CatalogSyncRun>
 */
class CatalogSyncRunRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CatalogSyncRun::class);
    }

    /** @return list<CatalogSyncRun> newest first */
    public function findRecent(int $limit = 50): array
    {
        return $this->findBy([], ['startedAt' => 'DESC', 'id' => 'DESC'], $limit);
    }

    /**
     * Marks runs whose worker went away as failed.
     *
     * A process killed mid-sync (OOM, container restart, Ctrl-C) never gets
     * to write its terminal status, so the row would otherwise sit at
     * RUNNING forever and the next run would look like it never happened.
     * Anything without a heartbeat since $threshold is treated as gone.
     *
     * @return int number of runs reaped
     */
    public function failStaleRuns(\DateTimeImmutable $threshold): int
    {
        return (int) $this->createQueryBuilder('r')
            ->update()
            ->set('r.status', ':failed')
            ->set('r.finishedAt', ':now')
            ->set('r.error', ':error')
            ->andWhere('r.status = :running')
            ->andWhere('COALESCE(r.heartbeatAt, r.startedAt) < :threshold')
            ->setParameter('failed', CatalogSyncRun::STATUS_FAILED)
            ->setParameter('running', CatalogSyncRun::STATUS_RUNNING)
            ->setParameter('now', new \DateTimeImmutable())
            ->setParameter('error', 'Interrupted: the worker stopped responding (crash, restart, or out of memory).')
            ->setParameter('threshold', $threshold)
            ->getQuery()
            ->execute();
    }
}
