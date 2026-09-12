<?php

namespace App\Repository;

use App\Entity\CustomerSetAlert;
use App\Entity\Store;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<CustomerSetAlert> */
class CustomerSetAlertRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CustomerSetAlert::class);
    }

    /** @return list<CustomerSetAlert> */
    public function findForUser(User $user, ?Store $store = null, ?int $offset = null, ?int $limit = null): array
    {
        $qb = $this->createQueryBuilder('alert')
            ->innerJoin('alert.store', 'store')->addSelect('store')
            ->andWhere('alert.user = :user')
            ->setParameter('user', $user)
            ->orderBy('alert.createdAt', 'DESC');

        if ($store instanceof Store) {
            $qb->andWhere('alert.store = :store')->setParameter('store', $store);
        }
        if (null !== $offset) {
            $qb->setFirstResult($offset);
        }
        if (null !== $limit) {
            $qb->setMaxResults($limit);
        }

        return $qb->getQuery()->getResult();
    }

    public function countForUser(User $user, ?Store $store = null): int
    {
        $qb = $this->createQueryBuilder('alert')
            ->select('COUNT(alert.id)')
            ->andWhere('alert.user = :user')
            ->setParameter('user', $user);

        if ($store instanceof Store) {
            $qb->andWhere('alert.store = :store')->setParameter('store', $store);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function findWatch(User $user, Store $store, string $game, string $setCode): ?CustomerSetAlert
    {
        return $this->findOneBy([
            'user' => $user,
            'store' => $store,
            'game' => mb_strtolower(trim($game)),
            'setCode' => mb_strtolower(trim($setCode)),
        ]);
    }

    /** @return list<CustomerSetAlert> */
    public function findForStore(Store $store): array
    {
        return $this->createQueryBuilder('alert')
            ->innerJoin('alert.user', 'user')->addSelect('user')
            ->andWhere('alert.store = :store')
            ->setParameter('store', $store)
            ->getQuery()
            ->getResult();
    }

    /** @return list<CustomerSetAlert> */
    public function findMatchingStock(Store $store, string $game, string $setCode): array
    {
        return $this->createQueryBuilder('alert')
            ->innerJoin('alert.user', 'user')->addSelect('user')
            ->andWhere('alert.store = :store')
            ->andWhere('alert.game = :game')
            ->andWhere('alert.setCode = :setCode')
            ->setParameter('store', $store)
            ->setParameter('game', mb_strtolower(trim($game)))
            ->setParameter('setCode', mb_strtolower(trim($setCode)))
            ->getQuery()
            ->getResult();
    }
}
