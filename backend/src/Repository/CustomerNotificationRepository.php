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
     * Most recent notifications for the bell dropdown. Bounded — notifications
     * accrete forever, and the bell only ever shows recent activity; an
     * unbounded fetch grew monotonically with customer lifetime.
     *
     * @return list<CustomerNotification>
     */
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
