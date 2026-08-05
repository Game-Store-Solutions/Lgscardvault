<?php

namespace App\Repository;

use App\Entity\SubscriptionCharge;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SubscriptionCharge>
 */
class SubscriptionChargeRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SubscriptionCharge::class);
    }

    /** @return list<SubscriptionCharge> */
    public function findRecent(int $limit = 50): array
    {
        return $this->createQueryBuilder('c')
            ->addSelect('s')
            ->join('c.store', 's')
            ->orderBy('c.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Collected and failed totals per calendar month, newest first. Grouped in
     * SQL rather than in PHP so the history stays cheap as charges accumulate.
     *
     * @return list<array{month: string, paidCents: int, paidCount: int, failedCount: int}>
     */
    public function monthlyTotals(int $months = 6): array
    {
        $sql = <<<'SQL'
            SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_cents,
                   COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
                   COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
            FROM subscription_charges
            WHERE created_at >= date_trunc('month', NOW()) - (:months * INTERVAL '1 month')
            GROUP BY 1
            ORDER BY 1 DESC
            SQL;

        $rows = $this->getEntityManager()->getConnection()
            ->executeQuery($sql, ['months' => $months - 1])
            ->fetchAllAssociative();

        return array_map(static fn (array $row): array => [
            'month' => (string) $row['month'],
            'paidCents' => (int) $row['paid_cents'],
            'paidCount' => (int) $row['paid_count'],
            'failedCount' => (int) $row['failed_count'],
        ], $rows);
    }

    /** Amount successfully collected since the start of the current month. */
    public function collectedThisMonthCents(): int
    {
        return (int) $this->createQueryBuilder('c')
            ->select('COALESCE(SUM(c.amountCents), 0)')
            ->andWhere('c.status = :paid')
            ->andWhere('c.createdAt >= :start')
            ->setParameter('paid', SubscriptionCharge::STATUS_PAID)
            ->setParameter('start', new \DateTimeImmutable('first day of this month 00:00:00'))
            ->getQuery()
            ->getSingleScalarResult();
    }
}
