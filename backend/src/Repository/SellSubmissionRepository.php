<?php

namespace App\Repository;

use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SellSubmission>
 */
class SellSubmissionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SellSubmission::class);
    }

    /** @return list<SellSubmission> newest first */
    public function findForStore(Store $store): array
    {
        return $this->findBy(['store' => $store], ['createdAt' => 'DESC', 'id' => 'DESC'], 200);
    }

    /** @return list<SellSubmission> newest first */
    public function findForUserAndStore(User $user, Store $store): array
    {
        return $this->findBy(['user' => $user, 'store' => $store], ['createdAt' => 'DESC', 'id' => 'DESC'], 100);
    }
}
