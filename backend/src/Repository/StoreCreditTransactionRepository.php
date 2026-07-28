<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StoreCreditTransaction>
 */
class StoreCreditTransactionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StoreCreditTransaction::class);
    }

    /** Current balance in cents: the sum of every transaction. */
    public function balanceFor(User $user, Store $store): int
    {
        return (int) $this->createQueryBuilder('t')
            ->select('COALESCE(SUM(t.amountCents), 0)')
            ->andWhere('t.user = :user')->setParameter('user', $user)
            ->andWhere('t.store = :store')->setParameter('store', $store)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /** @return list<StoreCreditTransaction> newest first */
    public function historyFor(User $user, Store $store, int $limit = 100): array
    {
        return $this->findBy(['user' => $user, 'store' => $store], ['createdAt' => 'DESC', 'id' => 'DESC'], $limit);
    }
}
