<?php

namespace App\Repository;

use App\Entity\CustomerNotification;
use App\Entity\Order;
use App\Entity\Store;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<CustomerNotification> */
class CustomerNotificationRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CustomerNotification::class);
    }

    /**
     * Most recent notifications for this shopper, optionally limited to one store.
     *
     * @return list<CustomerNotification>
     */
    public function findForUser(User $user, ?Store $store = null, int $limit = 200, int $offset = 0): array
    {
        $qb = $this->createQueryBuilder('notification')
            ->leftJoin('notification.relatedOrder', 'relatedOrder')->addSelect('relatedOrder')
            ->innerJoin('notification.store', 'store')->addSelect('store')
            ->andWhere('notification.user = :user')
            ->setParameter('user', $user)
            ->orderBy('notification.createdAt', 'DESC')
            ->setFirstResult($offset)
            ->setMaxResults($limit);

        if ($store instanceof Store) {
            $qb->andWhere('notification.store = :store')->setParameter('store', $store);
        }

        return $qb->getQuery()->getResult();
    }

    public function countForUser(User $user, ?Store $store = null): int
    {
        $qb = $this->createQueryBuilder('notification')
            ->select('COUNT(notification.id)')
            ->andWhere('notification.user = :user')
            ->setParameter('user', $user);

        if ($store instanceof Store) {
            $qb->andWhere('notification.store = :store')->setParameter('store', $store);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function countUnreadForUser(User $user, ?Store $store = null): int
    {
        $qb = $this->createQueryBuilder('notification')
            ->select('COUNT(notification.id)')
            ->andWhere('notification.user = :user')
            ->andWhere('notification.readAt IS NULL')
            ->setParameter('user', $user);

        if ($store instanceof Store) {
            $qb->andWhere('notification.store = :store')->setParameter('store', $store);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function findForUserAndStore(User $user, Store $store, int $limit = 100): array
    {
        return $this->createQueryBuilder('notification')
            ->leftJoin('notification.relatedOrder', 'relatedOrder')
            ->addSelect('relatedOrder')
            ->andWhere('notification.user = :user')
            ->andWhere('notification.store = :store')
            ->setParameter('user', $user)
            ->setParameter('store', $store)
            ->orderBy('notification.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    public function findOneForOrder(User $user, Order $order, string $type): ?CustomerNotification
    {
        return $this->findOneBy([
            'user' => $user,
            'relatedOrder' => $order,
            'type' => $type,
        ]);
    }

    /**
     * Mark every unread notification for this shopper, optionally one store
     * and/or a set of types (e.g. order alerts when the Orders tab is opened).
     *
     * @param list<string>|null $types
     */
    public function markAllReadForUser(User $user, ?Store $store = null, ?array $types = null): int
    {
        $qb = $this->createQueryBuilder('notification')
            ->update()
            ->set('notification.readAt', ':now')
            ->andWhere('notification.user = :user')
            ->andWhere('notification.readAt IS NULL')
            ->setParameter('now', new \DateTimeImmutable())
            ->setParameter('user', $user);

        if ($store instanceof Store) {
            $qb->andWhere('notification.store = :store')->setParameter('store', $store);
        }
        if (null !== $types && [] !== $types) {
            $qb->andWhere('notification.type IN (:types)')->setParameter('types', $types);
        }

        return (int) $qb->getQuery()->execute();
    }

    /** Dedupe lookup for repeatable notifications (e.g. want-list matches). */
    public function findOneByTitle(User $user, Store $store, string $type, string $title): ?CustomerNotification
    {
        return $this->findOneBy([
            'user' => $user,
            'store' => $store,
            'type' => $type,
            'title' => $title,
        ]);
    }
}
