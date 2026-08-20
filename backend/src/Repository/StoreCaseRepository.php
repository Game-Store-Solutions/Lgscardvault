<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StoreCase;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StoreCase>
 */
class StoreCaseRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StoreCase::class);
    }

    /**
     * All of a store's cases in display order, sections eagerly loaded with
     * their cards → inventory listing → card (one query for the whole Case
     * Cards page).
     *
     * @return list<StoreCase>
     */
    public function findForStore(Store $store): array
    {
        return $this->createQueryBuilder('k')
            ->andWhere('k.store = :store')
            ->setParameter('store', $store)
            ->leftJoin('k.sections', 's')->addSelect('s')
            ->leftJoin('s.cards', 'sc')->addSelect('sc')
            ->leftJoin('sc.inventoryItem', 'ii')->addSelect('ii')
            ->leftJoin('ii.card', 'c')->addSelect('c')
            ->leftJoin('c.game', 'g')->addSelect('g')
            ->orderBy('k.position', 'ASC')
            ->addOrderBy('k.id', 'ASC')
            ->addOrderBy('s.position', 'ASC')
            ->addOrderBy('s.id', 'ASC')
            ->addOrderBy('sc.position', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findOneForStore(Store $store, int $id): ?StoreCase
    {
        return $this->createQueryBuilder('k')
            ->andWhere('k.store = :store')
            ->andWhere('k.id = :id')
            ->setParameter('store', $store)
            ->setParameter('id', $id)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function nextPosition(Store $store): int
    {
        $max = $this->createQueryBuilder('k')
            ->select('MAX(k.position)')
            ->andWhere('k.store = :store')
            ->setParameter('store', $store)
            ->getQuery()
            ->getSingleScalarResult();

        return null === $max ? 0 : ((int) $max) + 1;
    }
}
