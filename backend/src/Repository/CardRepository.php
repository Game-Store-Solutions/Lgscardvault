<?php

namespace App\Repository;

use App\Entity\Card;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Card>
 */
class CardRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Card::class);
    }

    /**
     * Substring name search. Backed by the trigram GIN index on LOWER(name)
     * (see migration Version20260718090000) so the leading-% LIKE no longer
     * forces a sequential scan of the whole catalog.
     *
     * @return list<Card>
     */
    public function searchByName(string $query, int $limit = 20): array
    {
        return $this->createQueryBuilder('c')
            ->andWhere('LOWER(c.name) LIKE :query')
            ->setParameter('query', '%'.strtolower($query).'%')
            ->orderBy('c.name', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Exact-name lookup for decklist lines: full name or the front face of a
     * double-faced card ("Fable of the Mirror-Breaker // ..."). Any printing
     * satisfies a deck line, so the first match wins.
     */
    public function findOneByExactName(string $name): ?\App\Entity\Card
    {
        $lower = mb_strtolower(trim($name));
        if ('' === $lower) {
            return null;
        }

        return $this->createQueryBuilder('c')
            ->andWhere('LOWER(c.name) = :name OR LOWER(c.name) LIKE :front')
            ->setParameter('name', $lower)
            ->setParameter('front', $lower.' //%')
            ->orderBy('c.releasedAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Printing lookup by natural key. A printing is uniquely identified by
     * set code + collector number, and every import row carries both — this
     * is the primary (indexed, exact) match path for imports; name search is
     * only the fallback. Backed by the expression index on
     * (LOWER(set_code), LOWER(collector_number)).
     *
     * Returns a list because multiple language rows can share a set/collector
     * pair; callers pick with their own filters.
     *
     * @return list<Card>
     */
    public function findByNaturalKey(string $setCode, string $collectorNumber, int $limit = 10): array
    {
        return $this->createQueryBuilder('c')
            ->andWhere('LOWER(c.setCode) = :setCode')
            ->andWhere('LOWER(c.collectorNumber) = :collectorNumber')
            ->setParameter('setCode', strtolower(trim($setCode)))
            ->setParameter('collectorNumber', strtolower(trim($collectorNumber)))
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /** Is this a set code the local catalog knows? (case-insensitive) */
    public function setCodeExists(string $setCode): bool
    {
        return null !== $this->createQueryBuilder('c')
            ->select('1')
            ->andWhere('LOWER(c.setCode) = :setCode')
            ->setParameter('setCode', strtolower(trim($setCode)))
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Resolve a full set NAME ("Adventures in the Forgotten Realms") to its
     * code ("afr") via the local catalog, case-insensitively. Null when no set
     * by that name is known locally.
     */
    public function findSetCodeByName(string $setName): ?string
    {
        $row = $this->createQueryBuilder('c')
            ->select('c.setCode')
            ->andWhere('LOWER(c.setName) = :setName')
            ->setParameter('setName', strtolower(trim($setName)))
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        return is_array($row) ? (string) $row['setCode'] : null;
    }
}
