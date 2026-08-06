<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StoreCustomer;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StoreCustomer>
 */
class StoreCustomerRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StoreCustomer::class);
    }

    public function findOneForUserAndStore(User $user, Store $store): ?StoreCustomer
    {
        return $this->findOneBy(['user' => $user, 'store' => $store]);
    }

    public function getOrCreateForUserAndStore(User $user, Store $store): StoreCustomer
    {
        $customer = $this->findOneForUserAndStore($user, $store);
        if ($customer instanceof StoreCustomer) {
            return $customer;
        }

        return (new StoreCustomer())
            ->setUser($user)
            ->setStore($store);
    }

    /** @return list<StoreCustomer> */
    public function findAllForUser(User $user): array
    {
        return $this->findBy(['user' => $user], ['updatedAt' => 'DESC']);
    }
}
