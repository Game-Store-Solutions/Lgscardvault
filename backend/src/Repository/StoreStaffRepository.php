<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StoreStaff;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StoreStaff>
 */
class StoreStaffRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StoreStaff::class);
    }

    public function findOneFor(Store $store, User $user): ?StoreStaff
    {
        return $this->findOneBy(['store' => $store, 'user' => $user]);
    }

    /**
     * Stores this user may manage as staff (not as the owner).
     *
     * @return list<StoreStaff>
     */
    public function findAdminMemberships(User $user): array
    {
        return $this->createQueryBuilder('staff')
            ->join('staff.store', 'store')
            ->addSelect('store')
            ->andWhere('staff.user = :user')
            ->andWhere('staff.role = :role')
            ->setParameter('user', $user)
            ->setParameter('role', StoreStaff::ROLE_ADMIN)
            ->orderBy('store.name', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return list<StoreStaff>
     */
    public function findForStore(Store $store): array
    {
        return $this->createQueryBuilder('staff')
            ->join('staff.user', 'user')
            ->addSelect('user')
            ->andWhere('staff.store = :store')
            ->setParameter('store', $store)
            ->orderBy('user.displayName', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
