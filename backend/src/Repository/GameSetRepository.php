<?php

namespace App\Repository;

use App\Entity\Game;
use App\Entity\GameSet;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<GameSet>
 */
class GameSetRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, GameSet::class);
    }

    public function findOneByTcgcsvGroupId(int $groupId): ?GameSet
    {
        return $this->findOneBy(['tcgcsvGroupId' => $groupId]);
    }

    /** @return list<GameSet> newest releases first */
    public function findForGame(Game $game): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.game = :game')->setParameter('game', $game)
            ->orderBy('s.releaseDate', 'DESC')
            ->addOrderBy('s.name', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
