<?php

namespace App\Repository;

use App\Entity\CustomerFavorite;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Entity\StoreCustomer;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CustomerFavorite>
 */
class CustomerFavoriteRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CustomerFavorite::class);
    }

    public function findOneForCustomerAndItem(StoreCustomer $customer, InventoryItem $item): ?CustomerFavorite
    {
        return $this->findOneBy(['customer' => $customer, 'inventoryItem' => $item]);
    }

    /** @return list<CustomerFavorite> */
    public function findForCustomer(StoreCustomer $customer): array
    {
        return $this->createQueryBuilder('favorite')
            ->join('favorite.inventoryItem', 'item')
            ->join('item.card', 'card')
            ->addSelect('item', 'card')
            ->andWhere('favorite.customer = :customer')
            ->setParameter('customer', $customer)
            ->orderBy('favorite.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return list<CustomerFavorite>
     */
    public function findForUser(User $user, ?Store $store = null, ?int $offset = null, ?int $limit = null): array
    {
        $qb = $this->createQueryBuilder('favorite')
            ->join('favorite.inventoryItem', 'item')->addSelect('item')
            ->join('item.card', 'card')->addSelect('card')
            ->innerJoin('favorite.customer', 'customer')->addSelect('customer')
            ->innerJoin('customer.store', 'store')->addSelect('store')
            ->andWhere('customer.user = :user')
            ->setParameter('user', $user)
            ->orderBy('favorite.createdAt', 'DESC')
            ->addOrderBy('favorite.id', 'DESC');

        if ($store instanceof Store) {
            $qb->andWhere('customer.store = :store')->setParameter('store', $store);
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
        $qb = $this->createQueryBuilder('favorite')
            ->select('COUNT(favorite.id)')
            ->innerJoin('favorite.customer', 'customer')
            ->andWhere('customer.user = :user')
            ->setParameter('user', $user);

        if ($store instanceof Store) {
            $qb->andWhere('customer.store = :store')->setParameter('store', $store);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }
}
