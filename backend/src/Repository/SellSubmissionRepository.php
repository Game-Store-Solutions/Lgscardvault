<?php

namespace App\Repository;

use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SellSubmission>
 */
class SellSubmissionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SellSubmission::class);
    }

    /** @return list<SellSubmission> newest first */
    public function findForStore(Store $store): array
    {
        return $this->findBy(['store' => $store], ['createdAt' => 'DESC', 'id' => 'DESC'], 200);
    }

    /** @return list<SellSubmission> newest first */
    public function findForUserAndStore(User $user, Store $store): array
    {
        return $this->findBy(['user' => $user, 'store' => $store], ['createdAt' => 'DESC', 'id' => 'DESC'], 100);
    }

    /** @return list<SellSubmission> newest first */
    public function findForUser(User $user, ?Store $store = null, ?int $offset = null, ?int $limit = 200): array
    {
        $criteria = ['user' => $user];
        if ($store instanceof Store) {
            $criteria['store'] = $store;
        }

        return $this->findBy($criteria, ['createdAt' => 'DESC', 'id' => 'DESC'], $limit, $offset);
    }

    public function countForUser(User $user, ?Store $store = null): int
    {
        $criteria = ['user' => $user];
        if ($store instanceof Store) {
            $criteria['store'] = $store;
        }

        return $this->count($criteria);
    }

    public function countPendingByStore(Store $store): int
    {
        return (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->andWhere('s.store = :store')
            ->andWhere('s.status = :pending')
            ->setParameter('store', $store)
            ->setParameter('pending', SellSubmission::STATUS_PENDING)
            ->getQuery()
            ->getSingleScalarResult();
    }
}
