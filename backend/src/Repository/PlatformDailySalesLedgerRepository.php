<?php

namespace App\Repository;

use App\Entity\PlatformDailySalesLedger;
use App\Entity\Store;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<PlatformDailySalesLedger>
 */
class PlatformDailySalesLedgerRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, PlatformDailySalesLedger::class);
    }

    public function findForStoreAndDate(Store $store, \DateTimeImmutable $businessDate): ?PlatformDailySalesLedger
    {
        return $this->findOneBy([
            'store' => $store,
            'businessDate' => $businessDate,
        ]);
    }

    /**
     * @return list<PlatformDailySalesLedger>
     */
    public function findUnsettledBefore(\DateTimeImmutable $beforeDate): array
    {
        return $this->createQueryBuilder('l')
            ->andWhere('l.settledAt IS NULL')
            ->andWhere('l.businessDate < :before')
            ->setParameter('before', $beforeDate)
            ->orderBy('l.businessDate', 'ASC')
            ->addOrderBy('l.id', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
