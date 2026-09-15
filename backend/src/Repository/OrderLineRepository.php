<?php

namespace App\Repository;

use App\Entity\OrderLine;
use App\Entity\Store;
use App\Entity\StoreSection;
use App\Enum\OrderStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OrderLine>
 */
class OrderLineRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OrderLine::class);
    }

    /**
     * Case-card lines still waiting to be pulled from one section.
     *
     * @return list<OrderLine>
     */
    public function findOpenPullLinesForSection(StoreSection $section): array
    {
        return $this->openCaseLineQuery()
            ->andWhere('sc.section = :section')
            ->setParameter('section', $section)
            ->orderBy('o.createdAt', 'ASC')
            ->addOrderBy('l.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Case-card lines still waiting to be pulled anywhere in the store.
     *
     * @return list<OrderLine>
     */
    public function findOpenPullLinesForStore(Store $store): array
    {
        return $this->openCaseLineQuery()
            ->addSelect('sc')
            ->join('sc.section', 's')->addSelect('s')
            ->leftJoin('s.storeCase', 'cs')->addSelect('cs')
            ->andWhere('s.store = :store')
            ->setParameter('store', $store)
            ->orderBy('cs.position', 'ASC')
            ->addOrderBy('s.position', 'ASC')
            ->addOrderBy('o.createdAt', 'ASC')
            ->addOrderBy('l.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    private function openCaseLineQuery(): QueryBuilder
    {
        return $this->createQueryBuilder('l')
            ->join('l.sectionCard', 'sc')
            ->join('l.parentOrder', 'o')->addSelect('o')
            ->leftJoin('l.card', 'c')->addSelect('c')
            ->andWhere('o.status IN (:statuses)')
            ->andWhere('l.caseQuantity > 0')
            ->setParameter('statuses', OrderStatus::pullSheetStatuses());
    }
}
