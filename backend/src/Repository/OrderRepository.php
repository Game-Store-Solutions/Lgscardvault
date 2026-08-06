<?php

namespace App\Repository;

use App\Entity\Order;
use App\Entity\Store;
use App\Enum\OrderStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Order>
 */
class OrderRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Order::class);
    }

    /**
     * One page of a store's orders, newest first, with lines AND their cards
     * fetch-joined (serializing lines without the card join caused one lazy
     * card SELECT per order line — N+1).
     *
     * Two-step fetch: page the order ids first (LIMIT/OFFSET on a to-many
     * fetch join truncates joined ROWS, not orders — the classic Doctrine
     * pagination pitfall), then load those ids with the joins.
     *
     * @param list<OrderStatus>|null $statuses when set, only orders in these statuses
     *
     * @return list<Order>
     */
    public function findPageByStore(Store $store, int $offset, int $limit, ?array $statuses = null): array
    {
        $ids = $this->orderIdsPage($store, $offset, $limit, $statuses);

        if ([] === $ids) {
            return [];
        }

        return $this->createQueryBuilder('o')
            ->leftJoin('o.lines', 'line')
            ->addSelect('line')
            ->leftJoin('line.card', 'card')
            ->addSelect('card')
            ->andWhere('o.id IN (:ids)')
            ->setParameter('ids', array_map('intval', $ids), ArrayParameterType::INTEGER)
            ->orderBy('o.createdAt', 'DESC')
            ->addOrderBy('o.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @param list<OrderStatus>|null $statuses
     *
     * @return list<int>
     */
    private function orderIdsPage(Store $store, int $offset, int $limit, ?array $statuses): array
    {
        $qb = $this->createQueryBuilder('o')
            ->select('o.id')
            ->andWhere('o.store = :store')
            ->setParameter('store', $store)
            ->orderBy('o.createdAt', 'DESC')
            ->addOrderBy('o.id', 'DESC')
            ->setFirstResult(max(0, $offset))
            ->setMaxResults(max(1, $limit));

        if (null !== $statuses && [] !== $statuses) {
            $values = array_map(static fn (OrderStatus $s) => $s->value, $statuses);
            $qb->andWhere('o.status IN (:statuses)')
                ->setParameter('statuses', $values, ArrayParameterType::STRING);
        }

        return $qb->getQuery()->getSingleColumnResult();
    }

    /**
     * @param list<OrderStatus>|null $statuses
     */
    public function countByStore(Store $store, ?array $statuses = null): int
    {
        $qb = $this->createQueryBuilder('o')
            ->select('COUNT(o.id)')
            ->andWhere('o.store = :store')
            ->setParameter('store', $store);

        if (null !== $statuses && [] !== $statuses) {
            $values = array_map(static fn (OrderStatus $s) => $s->value, $statuses);
            $qb->andWhere('o.status IN (:statuses)')
                ->setParameter('statuses', $values, ArrayParameterType::STRING);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /** Orders still in the store queue (pending → shipped); not fulfilled/closed. */
    public function countOpenByStore(Store $store): int
    {
        $closed = [
            OrderStatus::FULFILLED->value,
            OrderStatus::COMPLETED->value,
            OrderStatus::CANCELLED->value,
            OrderStatus::REFUNDED->value,
        ];

        return (int) $this->createQueryBuilder('o')
            ->select('COUNT(o.id)')
            ->andWhere('o.store = :store')
            ->andWhere('o.status NOT IN (:closed)')
            ->setParameter('store', $store)
            ->setParameter('closed', $closed, ArrayParameterType::STRING)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * @param list<OrderStatus> $statuses
     */
    public function countByStoreAndStatuses(Store $store, array $statuses): int
    {
        if ([] === $statuses) {
            return 0;
        }

        $values = array_map(static fn (OrderStatus $s) => $s->value, $statuses);

        return (int) $this->createQueryBuilder('o')
            ->select('COUNT(o.id)')
            ->andWhere('o.store = :store')
            ->andWhere('o.status IN (:statuses)')
            ->setParameter('store', $store)
            ->setParameter('statuses', $values, ArrayParameterType::STRING)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /** @return array{openCount: int, pending: int, processing: int, delivery: int, delivered: int, total: int} */
    public function countQueueSummaryByStore(Store $store): array
    {
        $pending = $this->countByStoreAndStatuses($store, [OrderStatus::PENDING]);
        $processing = $this->countByStoreAndStatuses($store, [OrderStatus::RECEIVED, OrderStatus::PAID]);
        $delivery = $this->countByStoreAndStatuses($store, [OrderStatus::SHIPPED]);
        $delivered = $this->countByStoreAndStatuses($store, [OrderStatus::FULFILLED, OrderStatus::COMPLETED]);

        return [
            'openCount' => $pending + $processing + $delivery,
            'pending' => $pending,
            'processing' => $processing,
            'delivery' => $delivery,
            'delivered' => $delivered,
            'total' => $this->countByStore($store),
        ];
    }

    /**
     * A customer's orders in one store, newest first. Backed by the
     * (store_id, LOWER(customer_email)) expression index and bounded —
     * previously an unindexed, unlimited scan of the store's whole order
     * table per "my orders" view.
     *
     * @return list<Order>
     */
    public function findByStoreAndCustomerEmail(Store $store, string $email, int $limit = 500): array
    {
        return $this->findPageByStoreAndCustomerEmail($store, $email, 0, $limit);
    }

    public function countByStoreAndCustomerEmail(Store $store, string $email): int
    {
        return (int) $this->createQueryBuilder('o')
            ->select('COUNT(o.id)')
            ->andWhere('o.store = :store')
            ->andWhere('LOWER(o.customerEmail) = LOWER(:email)')
            ->setParameter('store', $store)
            ->setParameter('email', $email)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * @return list<Order>
     */
    public function findPageByStoreAndCustomerEmail(Store $store, string $email, int $offset, int $limit): array
    {
        $ids = $this->createQueryBuilder('o')
            ->select('o.id')
            ->andWhere('o.store = :store')
            ->andWhere('LOWER(o.customerEmail) = LOWER(:email)')
            ->setParameter('store', $store)
            ->setParameter('email', $email)
            ->orderBy('o.createdAt', 'DESC')
            ->addOrderBy('o.id', 'DESC')
            ->setFirstResult(max(0, $offset))
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getSingleColumnResult();

        if ([] === $ids) {
            return [];
        }

        return $this->loadOrdersWithLinesByIds($ids);
    }

    /**
     * Every order placed with this account email, across all stores, newest first.
     *
     * @return list<Order>
     */
    public function findByCustomerEmail(string $email, int $limit = 500): array
    {
        return $this->findPageByCustomerEmail($email, 0, $limit);
    }

    public function countByCustomerEmail(string $email): int
    {
        return (int) $this->createQueryBuilder('o')
            ->select('COUNT(o.id)')
            ->andWhere('LOWER(o.customerEmail) = LOWER(:email)')
            ->setParameter('email', $email)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * @return list<Order>
     */
    public function findPageByCustomerEmail(string $email, int $offset, int $limit): array
    {
        $ids = $this->createQueryBuilder('o')
            ->select('o.id')
            ->andWhere('LOWER(o.customerEmail) = LOWER(:email)')
            ->setParameter('email', $email)
            ->orderBy('o.createdAt', 'DESC')
            ->addOrderBy('o.id', 'DESC')
            ->setFirstResult(max(0, $offset))
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getSingleColumnResult();

        if ([] === $ids) {
            return [];
        }

        return $this->loadOrdersWithLinesByIds($ids);
    }

    /**
     * @param list<int|string> $ids
     *
     * @return list<Order>
     */
    private function loadOrdersWithLinesByIds(array $ids): array
    {
        return $this->createQueryBuilder('o')
            ->leftJoin('o.lines', 'line')
            ->addSelect('line')
            ->leftJoin('line.card', 'card')
            ->addSelect('card')
            ->leftJoin('o.store', 'store')
            ->addSelect('store')
            ->andWhere('o.id IN (:ids)')
            ->setParameter('ids', array_map('intval', $ids), ArrayParameterType::INTEGER)
            ->orderBy('o.createdAt', 'DESC')
            ->addOrderBy('o.id', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
