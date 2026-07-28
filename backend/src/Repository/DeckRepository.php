<?php

namespace App\Repository;

use App\Entity\Deck;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

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
}
