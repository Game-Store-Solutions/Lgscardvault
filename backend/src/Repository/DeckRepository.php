<?php

namespace App\Repository;

use App\Entity\Deck;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<Deck>
 */
class DeckRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Deck::class);
    }

    /** @return list<Deck> most recently updated first, lines pre-loaded */
    public function findForUser(User $user): array
    {
        return $this->createQueryBuilder('d')
            ->leftJoin('d.cards', 'c')->addSelect('c')
            ->andWhere('d.user = :user')->setParameter('user', $user)
            ->orderBy('d.updatedAt', 'DESC')
            ->addOrderBy('d.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    public function findOneForUser(User $user, int $id): ?Deck
    {
        return $this->findOneBy(['user' => $user, 'id' => $id]);
    }

    /**
     * Saved decks that contain a given oracle identity, for use as reference
     * decks. First-party data: no external terms, no rate limits, and it gets
     * better as the platform is used.
     *
     * Card lines are eager-loaded because the caller needs every row; without
     * the join this would be one query per deck.
     *
     * @return list<Deck>
     */
    public function findContainingOracleId(Uuid $oracleId, int $limit = 50): array
    {
        $ids = $this->createQueryBuilder('d')
            ->select('DISTINCT d.id')
            ->join('d.cards', 'dc')
            ->join('dc.card', 'c')
            ->andWhere('c.oracleId = :oracle')
            ->setParameter('oracle', $oracleId)
            ->orderBy('d.id', 'DESC')
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getSingleColumnResult();

        if ([] === $ids) {
            return [];
        }

        return $this->createQueryBuilder('d')
            ->leftJoin('d.cards', 'dc')->addSelect('dc')
            ->leftJoin('dc.card', 'c')->addSelect('c')
            ->andWhere('d.id IN (:ids)')
            ->setParameter('ids', $ids)
            ->orderBy('d.updatedAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
