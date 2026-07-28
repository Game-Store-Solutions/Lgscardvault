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
}
