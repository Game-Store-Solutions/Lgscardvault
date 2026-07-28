<?php

namespace App\Repository;

use App\Entity\Game;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Game>
 */
class GameRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Game::class);
    }

    public function findOneByCode(string $code): ?Game
    {
        return $this->findOneBy(['code' => strtolower(trim($code))]);
    }

    /** @return list<Game> active games in display order */
    public function findActive(): array
    {
        return $this->findBy(['active' => true], ['position' => 'ASC', 'id' => 'ASC']);
    }
}
