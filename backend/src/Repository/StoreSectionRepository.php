<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StoreSection;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StoreSection>
 */
class StoreSectionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StoreSection::class);
    }

    /**
     * All of a store's sections in display order, with their cards + the
     * underlying inventory listing and card eagerly loaded (avoids an N+1
     * when serializing the Case Cards page).
     *
     * @return list<StoreSection>
     */
    public function findForStore(Store $store): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.store = :store')
            ->setParameter('store', $store)
            ->leftJoin('s.cards', 'sc')->addSelect('sc')
            ->leftJoin('sc.inventoryItem', 'ii')->addSelect('ii')
            ->leftJoin('ii.card', 'c')->addSelect('c')
            ->orderBy('s.position', 'ASC')
            ->addOrderBy('s.id', 'ASC')
            ->addOrderBy('sc.position', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findOneForStore(Store $store, int $id): ?StoreSection
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.store = :store')
            ->andWhere('s.id = :id')
            ->setParameter('store', $store)
            ->setParameter('id', $id)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function nextPosition(Store $store): int
    {
        $max = $this->createQueryBuilder('s')
            ->select('MAX(s.position)')
            ->andWhere('s.store = :store')
            ->setParameter('store', $store)
            ->getQuery()
            ->getSingleScalarResult();

        return null === $max ? 0 : ((int) $max) + 1;
    }

    /** Next display index within a single case (0-based append). */
    public function nextPositionForCase(\App\Entity\StoreCase $case): int
    {
        $max = $this->createQueryBuilder('s')
            ->select('MAX(s.position)')
            ->andWhere('s.storeCase = :case')
            ->setParameter('case', $case)
            ->getQuery()
            ->getSingleScalarResult();

        return null === $max ? 0 : ((int) $max) + 1;
    }

    /**
     * @return list<StoreSection>
     */
    public function findForCase(\App\Entity\StoreCase $case): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.storeCase = :case')
            ->setParameter('case', $case)
            ->orderBy('s.position', 'ASC')
            ->addOrderBy('s.id', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
