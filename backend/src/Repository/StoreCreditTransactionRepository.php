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
    public function historyFor(User $user, Store $store, int $limit = 100, int $offset = 0): array
    {
        return $this->findBy(['user' => $user, 'store' => $store], ['createdAt' => 'DESC', 'id' => 'DESC'], $limit, $offset);
    }

    public function countHistoryFor(User $user, Store $store): int
    {
        return $this->count(['user' => $user, 'store' => $store]);
    }

    /**
     * Per-store balances for this shopper. Stores with a zero net (every grant
     * spent) still appear so the profile can show "you have shopped here".
     *
     * @return list<array{storeId: int, balanceCents: int}>
     */
    public function balancesForUser(User $user): array
    {
        $rows = $this->createQueryBuilder('t')
            ->select('IDENTITY(t.store) AS storeId, COALESCE(SUM(t.amountCents), 0) AS balanceCents')
            ->andWhere('t.user = :user')
            ->setParameter('user', $user)
            ->groupBy('t.store')
            ->getQuery()
            ->getArrayResult();

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'storeId' => (int) $row['storeId'],
                'balanceCents' => (int) $row['balanceCents'],
            ];
        }

        return $out;
    }

    /**
     * Customers with a positive credit balance at this store, richest first.
     *
     * @return list<array{userId: int, email: string, displayName: string, balanceCents: int, lastActivityAt: string}>
     */
    public function balancesForStore(Store $store): array
    {
        $rows = $this->createQueryBuilder('t')
            ->select(
                'u.id AS userId',
                'u.email AS email',
                'u.displayName AS displayName',
                'COALESCE(SUM(t.amountCents), 0) AS balanceCents',
                'MAX(t.createdAt) AS lastActivityAt',
            )
            ->join('t.user', 'u')
            ->andWhere('t.store = :store')
            ->setParameter('store', $store)
            ->groupBy('u.id', 'u.email', 'u.displayName')
            ->having('COALESCE(SUM(t.amountCents), 0) > 0')
            ->orderBy('balanceCents', 'DESC')
            ->addOrderBy('u.displayName', 'ASC')
            ->getQuery()
            ->getArrayResult();

        $out = [];
        foreach ($rows as $row) {
            $last = $row['lastActivityAt'] ?? null;
            $out[] = [
                'userId' => (int) $row['userId'],
                'email' => (string) $row['email'],
                'displayName' => (string) ($row['displayName'] ?? ''),
                'balanceCents' => (int) $row['balanceCents'],
                'lastActivityAt' => $last instanceof \DateTimeInterface
                    ? $last->format(DATE_ATOM)
                    : (string) $last,
            ];
        }

        return $out;
    }
}
