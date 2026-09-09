<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StoreSection;
use App\Entity\StoreSectionCard;
use App\Entity\InventoryItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StoreSectionCard>
 */
class StoreSectionCardRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StoreSectionCard::class);
    }

    public function nextPosition(StoreSection $section): int
    {
        $max = $this->createQueryBuilder('sc')
            ->select('MAX(sc.position)')
            ->andWhere('sc.section = :section')
            ->setParameter('section', $section)
            ->getQuery()
            ->getSingleScalarResult();

        return null === $max ? 0 : ((int) $max) + 1;
    }

    /**
     * Section pools holding a given listing with unsold copies remaining,
     * in stable case/section display order — the order sales are attributed
     * in. Section + case are eagerly joined for snapshotting names onto the
     * order line.
     *
     * @return list<StoreSectionCard>
     */
    public function findOpenPoolsForItem(\App\Entity\InventoryItem $item): array
    {
        return $this->createQueryBuilder('sc')
            ->join('sc.section', 's')->addSelect('s')
            ->join('s.storeCase', 'k')->addSelect('k')
            ->andWhere('sc.inventoryItem = :item')
            ->andWhere('sc.quantity > sc.soldQuantity')
            ->setParameter('item', $item)
            ->orderBy('k.position', 'ASC')
            ->addOrderBy('s.position', 'ASC')
            ->addOrderBy('sc.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Every section pool holding this listing (sold-out included).
     *
     * @return list<StoreSectionCard>
     */
    public function findAllForItem(\App\Entity\InventoryItem $item): array
    {
        return $this->createQueryBuilder('sc')
            ->join('sc.section', 's')->addSelect('s')
            ->andWhere('sc.inventoryItem = :item')
            ->setParameter('item', $item)
            ->orderBy('sc.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Unsold pool copies claimed per inventory item across ALL of the store's
     * case sections (optionally excluding one — the section being refilled).
     * Auto-fill subtracts these claims from on-hand stock so two sections
     * never promise the same physical copy.
     *
     * @return array<int, int> inventory item id → remaining allocated copies
     */
    public function remainingAllocatedByItem(Store $store, ?StoreSection $excludeSection = null): array
    {
        $qb = $this->createQueryBuilder('sc')
            ->select('IDENTITY(sc.inventoryItem) AS itemId')
            // sold ≤ quantity is invariant (allocation caps at remaining(), the
            // auto-fill freeze sets quantity = sold), so the plain difference
            // can't go negative — no GREATEST needed (which DQL lacks anyway).
            ->addSelect('SUM(sc.quantity - sc.soldQuantity) AS allocated')
            ->join('sc.section', 's')
            ->andWhere('s.store = :store')
            ->setParameter('store', $store)
            ->groupBy('sc.inventoryItem');

        if (null !== $excludeSection && null !== $excludeSection->getId()) {
            $qb->andWhere('s.id != :excluded')->setParameter('excluded', $excludeSection->getId());
        }

        $allocations = [];
        foreach ($qb->getQuery()->getArrayResult() as $row) {
            $allocations[(int) $row['itemId']] = (int) $row['allocated'];
        }

        return $allocations;
    }

    /**
     * How many of this listing's on-hand copies are still free to allocate to
     * a case section (optionally excluding one section — e.g. the one being
     * edited, so its current claim can be resized without double-counting).
     */
    public function freeStockForItem(Store $store, InventoryItem $item, ?StoreSection $excludeSection = null): int
    {
        $itemId = $item->getId();
        if (null === $itemId) {
            return 0;
        }

        $claimedElsewhere = $this->remainingAllocatedByItem($store, $excludeSection)[$itemId] ?? 0;

        return max(0, $item->getQuantity() - $claimedElsewhere);
    }
}
