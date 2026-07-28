<?php

namespace App\Repository;

use App\Entity\CsvImportJob;
use App\Entity\Store;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CsvImportJob>
 */
class CsvImportJobRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CsvImportJob::class);
    }

    public function findOneByStoreAndId(Store $store, int $id): ?CsvImportJob
    {
        return $this->createQueryBuilder('job')
            ->andWhere('job.store = :store')
            ->andWhere('job.id = :id')
            ->setParameter('store', $store)
            ->setParameter('id', $id)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function findLatestByStore(Store $store): ?CsvImportJob
    {
        return $this->createQueryBuilder('job')
            ->andWhere('job.store = :store')
            ->setParameter('store', $store)
            ->orderBy('job.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /** @return list<CsvImportJob> */
    public function findRecentByStore(Store $store, int $limit = 50): array
    {
        return $this->createQueryBuilder('job')
            ->andWhere('job.store = :store')
            ->setParameter('store', $store)
            ->orderBy('job.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Jobs left mid-flight by a worker that died (out of memory, restart,
     * deploy). Every batch touches updatedAt, so a job that has not moved
     * since $threshold has nobody working on it.
     *
     * @return list<CsvImportJob>
     */
    public function findStalledForStore(Store $store, \DateTimeImmutable $threshold): array
    {
        return $this->createQueryBuilder('job')
            ->andWhere('job.store = :store')
            ->andWhere('job.status = :processing')
            ->andWhere('job.updatedAt < :threshold')
            ->setParameter('store', $store)
            ->setParameter('processing', CsvImportJob::STATUS_PROCESSING)
            ->setParameter('threshold', $threshold)
            ->getQuery()
            ->getResult();
    }
}
