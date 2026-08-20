<?php

namespace App\Repository;

use App\Entity\CommanderCardStat;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<CommanderCardStat>
 */
class CommanderCardStatRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CommanderCardStat::class);
    }

    /**
     * Precomputed affinities for one commander/strategy scope, keyed by oracle id.
     *
     * One indexed query per recommendation request — the whole point of
     * precomputing. Returns plain arrays rather than entities because the
     * scoring loop only reads scalars and hydrating a few hundred entities would
     * cost more than the query.
     *
     * @return array<string, array{
     *   deckCount: int, sampleSize: int, inclusionRate: float,
     *   commanderAffinity: float, strategyAffinity: float,
     *   averageQuantity: float, baseScore: float, confidence: float,
     *   roleHint: ?string
     * }>
     */
    public function statsForScope(Uuid $commanderOracleId, string $strategyId, int $limit = 1200): array
    {
        $rows = $this->createQueryBuilder('s')
            ->select(
                's.oracleId AS oracleId',
                's.deckCount AS deckCount',
                's.sampleSize AS sampleSize',
                's.inclusionRate AS inclusionRate',
                's.commanderAffinity AS commanderAffinity',
                's.strategyAffinity AS strategyAffinity',
                's.averageQuantity AS averageQuantity',
                's.baseScore AS baseScore',
                's.confidence AS confidence',
                's.roleHint AS roleHint',
            )
            ->andWhere('s.commanderOracleId = :commander')
            ->andWhere('s.strategyId = :strategy')
            ->setParameter('commander', $commanderOracleId)
            ->setParameter('strategy', $strategyId)
            ->orderBy('s.baseScore', 'DESC')
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getArrayResult();

        $out = [];
        foreach ($rows as $row) {
            $out[strtolower((string) $row['oracleId'])] = [
                'deckCount' => (int) $row['deckCount'],
                'sampleSize' => (int) $row['sampleSize'],
                'inclusionRate' => (float) $row['inclusionRate'],
                'commanderAffinity' => (float) $row['commanderAffinity'],
                'strategyAffinity' => (float) $row['strategyAffinity'],
                'averageQuantity' => (float) $row['averageQuantity'],
                'baseScore' => (float) $row['baseScore'],
                'confidence' => (float) $row['confidence'],
                'roleHint' => null !== $row['roleHint'] ? (string) $row['roleHint'] : null,
            ];
        }

        return $out;
    }

    /**
     * Cross-commander aggregate for one strategy: what cards this archetype
     * plays in general, regardless of who is at the helm.
     *
     * The "general strategy data" rung of the fallback ladder, used when we hold
     * nothing for a specific commander. Cards seen under a single commander are
     * excluded because they describe that commander, not the archetype.
     *
     * @return array<string, array{strategyAffinity: float, inclusionRate: float, commanderCount: int}>
     */
    public function globalStrategyStats(string $strategyId, int $limit = 600, int $minCommanders = 2): array
    {
        $rows = $this->createQueryBuilder('s')
            ->select(
                's.oracleId AS oracleId',
                'AVG(s.strategyAffinity) AS strategyAffinity',
                'AVG(s.inclusionRate) AS inclusionRate',
                'COUNT(DISTINCT s.commanderOracleId) AS commanderCount',
            )
            ->andWhere('s.strategyId = :strategy')
            ->setParameter('strategy', $strategyId)
            ->groupBy('s.oracleId')
            ->having('COUNT(DISTINCT s.commanderOracleId) >= :minCommanders')
            ->setParameter('minCommanders', max(1, $minCommanders))
            ->orderBy('strategyAffinity', 'DESC')
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getArrayResult();

        $out = [];
        foreach ($rows as $row) {
            $out[strtolower((string) $row['oracleId'])] = [
                'strategyAffinity' => (float) $row['strategyAffinity'],
                'inclusionRate' => (float) $row['inclusionRate'],
                'commanderCount' => (int) $row['commanderCount'],
            ];
        }

        return $out;
    }

    public function countForScope(Uuid $commanderOracleId, string $strategyId): int
    {
        return (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->andWhere('s.commanderOracleId = :commander')
            ->andWhere('s.strategyId = :strategy')
            ->setParameter('commander', $commanderOracleId)
            ->setParameter('strategy', $strategyId)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * Replace every stat row for a commander. The refresher recomputes all
     * scopes together, so a delete-then-insert keeps the table consistent with
     * the current reference sample instead of leaving orphans behind when a
     * card drops out of the meta.
     */
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
