<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Store>
 */
class StoreRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Store::class);
    }

    public function findOneBySlug(string $slug): ?Store
    {
        return $this->findOneBy(['slug' => $slug]);
    }

    /** @return list<Store> */
    public function findActiveStores(): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.isActive = :active')
            ->setParameter('active', true)
            ->orderBy('s.name', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Stores where a customer has any activity — a saved profile (which
     * carts, favorites, and want lists hang off), orders, or sell/trade
     * submissions — with counts, newest activity first. Powers the global
     * account page's "your stores" list.
     *
     * @return list<array{id: int, name: string, slug: string, logoUrl: ?string, orderCount: int, submissionCount: int, lastActivityAt: string}>
     */
    public function findWithActivityForUser(User $user): array
    {
        $rows = $this->getEntityManager()->getConnection()->fetchAllAssociative(
            <<<'SQL'
            SELECT s.id, s.name, s.slug, s.logo_url,
                   COALESCE(o.order_count, 0) AS order_count,
                   COALESCE(sub.submission_count, 0) AS submission_count,
                   GREATEST(
                       COALESCE(o.last_at, 'epoch'::timestamp),
                       COALESCE(sub.last_at, 'epoch'::timestamp),
                       COALESCE(act.last_at, 'epoch'::timestamp)
                   ) AS last_activity_at
            FROM stores s
            LEFT JOIN (
                SELECT store_id, COUNT(*) AS order_count, MAX(created_at) AS last_at
                FROM orders WHERE customer_email = :email GROUP BY store_id
            ) o ON o.store_id = s.id
            LEFT JOIN (
                SELECT store_id, COUNT(*) AS submission_count, MAX(created_at) AS last_at
                FROM sell_submissions WHERE user_id = :userId GROUP BY store_id
            ) sub ON sub.store_id = s.id
            LEFT JOIN (
                -- Carts, favorites, and want lists all hang off this row.
                SELECT store_id, MAX(created_at) AS last_at
                FROM store_customers WHERE user_id = :userId GROUP BY store_id
            ) act ON act.store_id = s.id
            WHERE o.store_id IS NOT NULL OR sub.store_id IS NOT NULL OR act.store_id IS NOT NULL
            ORDER BY last_activity_at DESC
            SQL,
            ['email' => $user->getEmail(), 'userId' => $user->getId()],
        );

        return array_map(static fn (array $row) => [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'slug' => (string) $row['slug'],
            'logoUrl' => $row['logo_url'],
            'orderCount' => (int) $row['order_count'],
            'submissionCount' => (int) $row['submission_count'],
            'lastActivityAt' => (new \DateTimeImmutable((string) $row['last_activity_at']))->format(DATE_ATOM),
        ], $rows);
    }
}
