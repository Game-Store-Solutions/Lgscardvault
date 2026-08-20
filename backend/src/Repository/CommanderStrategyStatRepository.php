<?php

namespace App\Repository;

use App\Entity\CommanderStrategyStat;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<CommanderStrategyStat>
 */
class CommanderStrategyStatRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CommanderStrategyStat::class);
    }

    /**
     * Strategies observed for a commander, most played first.
     *
     * @return list<CommanderStrategyStat>
     */
    public function findForCommander(Uuid $commanderOracleId): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.commanderOracleId = :commander')
            ->setParameter('commander', $commanderOracleId)
            ->orderBy('s.deckCount', 'DESC')
            ->addOrderBy('s.confidence', 'DESC')
            ->getQuery()
            ->getResult();
    }

    public function findOneForScope(Uuid $commanderOracleId, string $strategyId): ?CommanderStrategyStat
    {
        return $this->findOneBy([
            'commanderOracleId' => $commanderOracleId,
            'strategyId' => $strategyId,
        ]);
    }

    /** Newest aggregate timestamp for a commander, or null when never built. */
    public function lastUpdatedAt(Uuid $commanderOracleId): ?\DateTimeImmutable
    {
        $value = $this->createQueryBuilder('s')
            ->select('MAX(s.updatedAt)')
            ->andWhere('s.commanderOracleId = :commander')
            ->setParameter('commander', $commanderOracleId)
            ->getQuery()
            ->getSingleScalarResult();

        if (!is_string($value) || '' === $value) {
            return null;
        }

        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            return null;
        }
    }

    public function deleteForCommander(Uuid $commanderOracleId): int
    {
        return (int) $this->createQueryBuilder('s')
            ->delete()
            ->andWhere('s.commanderOracleId = :commander')
            ->setParameter('commander', $commanderOracleId)
            ->getQuery()
            ->execute();
    }
}
