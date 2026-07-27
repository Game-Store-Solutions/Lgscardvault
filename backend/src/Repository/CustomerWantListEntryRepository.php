<?php

namespace App\Repository;

use App\Entity\CustomerWantListEntry;
use App\Entity\StoreCustomer;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CustomerWantListEntry>
 */
class CustomerWantListEntryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CustomerWantListEntry::class);
    }

    /** @return list<CustomerWantListEntry> */
    /**
     * Want-list entries matching a card name, across EVERY store's customers
     * — a want can be filled by any store that stocks the card.
     *
     * @return list<CustomerWantListEntry>
     */
    public function findMatchingCardName(string $cardName): array
    {
        return $this->createQueryBuilder('w')
            ->join('w.customer', 'c')->addSelect('c')
            ->join('c.user', 'u')->addSelect('u')
            ->andWhere('LOWER(w.cardName) = LOWER(:name)')
            ->setParameter('name', $cardName)
            ->getQuery()
            ->getResult();
    }

    public function findForCustomer(StoreCustomer $customer): array
    {
        return $this->createQueryBuilder('entry')
            ->leftJoin('entry.card', 'card')
            ->addSelect('card')
            ->andWhere('entry.customer = :customer')
            ->setParameter('customer', $customer)
            ->orderBy('entry.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
