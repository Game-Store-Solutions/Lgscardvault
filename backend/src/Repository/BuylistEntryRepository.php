<?php

namespace App\Repository;

use App\Entity\BuylistEntry;
use App\Entity\Store;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<BuylistEntry>
 */
class BuylistEntryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, BuylistEntry::class);
    }

    /** @return list<BuylistEntry> highest fixed offers first, then newest */
    public function findForStore(Store $store, bool $activeOnly = false): array
    {
        $qb = $this->createQueryBuilder('b')
            ->join('b.card', 'c')->addSelect('c')
            ->andWhere('b.store = :store')
            ->setParameter('store', $store)
            ->orderBy('b.offerCents', 'DESC')
            ->addOrderBy('b.id', 'DESC');
        if ($activeOnly) {
            $qb->andWhere('b.active = true');
        }

        return $qb->getQuery()->getResult();
    }

    public function findOneForStore(Store $store, int $id): ?BuylistEntry
    {
        return $this->findOneBy(['store' => $store, 'id' => $id]);
    }
}
