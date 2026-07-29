<?php

namespace App\Repository;

use App\Entity\SealedInventoryItem;
use App\Entity\SealedProduct;
use App\Entity\Store;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SealedInventoryItem>
 */
class SealedInventoryItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SealedInventoryItem::class);
    }

    public function findLine(Store $store, SealedProduct $product): ?SealedInventoryItem
    {
        return $this->findOneBy(['store' => $store, 'sealedProduct' => $product]);
    }

    public function findOneForStore(Store $store, int $id): ?SealedInventoryItem
    {
        return $this->findOneBy(['id' => $id, 'store' => $store]);
    }

    /**
     * Staff view: every line (including sold-out) with product/game/set
     * joined, optionally narrowed to one game.
     *
     * @return list<SealedInventoryItem>
     */
    public function findForStore(Store $store, ?string $gameCode = null, bool $inStockOnly = false): array
    {
        $qb = $this->createQueryBuilder('i')
            ->join('i.sealedProduct', 'p')->addSelect('p')
            ->join('p.game', 'g')->addSelect('g')
            ->leftJoin('p.gameSet', 's')->addSelect('s')
            ->andWhere('i.store = :store')->setParameter('store', $store)
            ->orderBy('g.position', 'ASC')
            ->addOrderBy('p.name', 'ASC');

        if (null !== $gameCode && '' !== $gameCode) {
            $qb->andWhere('g.code = :gameCode')->setParameter('gameCode', strtolower($gameCode));
        }
        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Headline numbers for one game's sealed stock in a store.
     *
     * @return array{products: int, units: int}
     */
    public function statsForGame(Store $store, string $gameCode): array
    {
        $row = $this->createQueryBuilder('i')
            ->select('COUNT(i.id) AS products', 'COALESCE(SUM(i.quantity), 0) AS units')
            ->join('i.sealedProduct', 'p')
            ->join('p.game', 'g')
            ->andWhere('i.store = :store')
            ->andWhere('g.code = :gameCode')
            ->setParameter('store', $store)
            ->setParameter('gameCode', strtolower(trim($gameCode)))
            ->getQuery()
            ->getSingleResult();

        return ['products' => (int) $row['products'], 'units' => (int) $row['units']];
    }

    /**
     * Game codes this store stocks sealed product for.
     *
     * @return list<string>
     */
    public function findStockedGameCodes(Store $store): array
    {
        $rows = $this->createQueryBuilder('i')
            ->select('g.code AS code')
            ->distinct()
            ->join('i.sealedProduct', 'p')
            ->join('p.game', 'g')
            ->andWhere('i.store = :store')
            ->andWhere('i.quantity > 0')
            ->setParameter('store', $store)
            ->getQuery()
            ->getScalarResult();

        return array_values(array_map(static fn (array $row): string => (string) $row['code'], $rows));
    }

    /**
     * Storefront spotlight: the store's freshest in-stock sealed lines.
     *
     * @return list<SealedInventoryItem>
     */
    public function findSpotlightForStore(Store $store, int $limit = 12, ?string $gameCode = null): array
    {
        $qb = $this->createQueryBuilder('i')
            ->join('i.sealedProduct', 'p')->addSelect('p')
            ->join('p.game', 'g')->addSelect('g')
            ->leftJoin('p.gameSet', 's')->addSelect('s')
            ->andWhere('i.store = :store')->setParameter('store', $store)
            ->andWhere('i.quantity > 0')
            ->orderBy('i.updatedAt', 'DESC')
            ->setMaxResults($limit);

        if (null !== $gameCode && '' !== $gameCode) {
            $qb->andWhere('g.code = :gameCode')->setParameter('gameCode', strtolower($gameCode));
        }

        return $qb->getQuery()->getResult();
    }
}
