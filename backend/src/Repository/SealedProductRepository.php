<?php

namespace App\Repository;

use App\Entity\Game;
use App\Entity\SealedProduct;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SealedProduct>
 */
class SealedProductRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SealedProduct::class);
    }

    public function findOneByTcgcsvProductId(int $productId): ?SealedProduct
    {
        return $this->findOneBy(['tcgcsvProductId' => (string) $productId]);
    }

    /**
     * Paginated catalog search: optional game, set, and name filters.
     *
     * @return array{items: list<SealedProduct>, total: int}
     */
    public function search(?Game $game, ?int $gameSetId, string $query, int $page, int $perPage = 24): array
    {
        $qb = $this->createQueryBuilder('p')
            ->leftJoin('p.gameSet', 's')->addSelect('s')
            ->leftJoin('p.game', 'g')->addSelect('g');

        if (null !== $game) {
            $qb->andWhere('p.game = :game')->setParameter('game', $game);
        }
        if (null !== $gameSetId) {
            $qb->andWhere('s.id = :setId')->setParameter('setId', $gameSetId);
        }
        $term = trim($query);
        if ('' !== $term) {
            $qb->andWhere('LOWER(p.name) LIKE :q')->setParameter('q', '%'.mb_strtolower($term).'%');
        }

        $total = (int) (clone $qb)->select('COUNT(p.id)')->resetDQLPart('orderBy')->getQuery()->getSingleScalarResult();

        $items = $qb
            ->orderBy('p.name', 'ASC')
            ->setFirstResult(max(0, ($page - 1)) * $perPage)
            ->setMaxResults($perPage)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'total' => $total];
    }
}
