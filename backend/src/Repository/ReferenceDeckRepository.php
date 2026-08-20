<?php

namespace App\Repository;

use App\Entity\ReferenceDeck;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<ReferenceDeck>
 */
class ReferenceDeckRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ReferenceDeck::class);
    }

    public function findOneByExternalId(string $provider, string $externalId): ?ReferenceDeck
    {
        return $this->findOneBy(['provider' => $provider, 'externalId' => $externalId]);
    }

    /**
     * Reference decks for a commander, most relevant first.
     *
     * @return list<ReferenceDeck>
     */
    public function findForCommander(Uuid $commanderOracleId, int $limit = 50): array
    {
        return $this->createQueryBuilder('d')
            ->andWhere('d.commanderOracleId = :commander')
            ->setParameter('commander', $commanderOracleId)
            ->orderBy('d.popularity', 'DESC')
            ->addOrderBy('d.id', 'ASC')
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getResult();
    }

    /**
     * The deck-membership matrix for a commander/strategy scope: one entry per
     * deck holding that deck's oracle ids.
     *
     * This is the single query that powers co-occurrence, lift, and existing-deck
     * synergy. It is a narrow two-column read over an indexed join (roughly
     * 1,000 rows for ten decks), which is why we compute card relationships on
     * demand instead of materialising an O(n²) pair table.
     *
     * @param ?string $strategyId null for every deck of the commander
     *
     * @return list<list<string>> lowercased oracle ids, one inner list per deck
     */
    public function findDeckMembershipMatrix(Uuid $commanderOracleId, ?string $strategyId, int $limit = 10): array
    {
        $deckIds = $this->relevantDeckIds($commanderOracleId, $strategyId, $limit);
        if ([] === $deckIds) {
            return [];
        }

        $rows = $this->getEntityManager()->createQueryBuilder()
            ->select('IDENTITY(rc.referenceDeck) AS deckId', 'rc.oracleId AS oracleId')
            ->from(\App\Entity\ReferenceDeckCard::class, 'rc')
            ->andWhere('rc.referenceDeck IN (:decks)')
            ->setParameter('decks', $deckIds)
            ->getQuery()
            ->getArrayResult();

        $grouped = array_fill_keys(array_map('strval', $deckIds), []);
        foreach ($rows as $row) {
            $deckId = (string) $row['deckId'];
            $grouped[$deckId][] = strtolower((string) $row['oracleId']);
        }

        // Drop decks whose card rows were pruned, so sample sizes stay honest.
        return array_values(array_filter($grouped, static fn (array $oracles): bool => [] !== $oracles));
    }

    /**
     * Card membership with quantities for a set of decks, in one query.
     *
     * Iterating `$deck->getCards()` instead would issue a lazy-load per deck —
     * the classic N+1 — which matters because the refresher walks every deck it
     * holds for a commander.
     *
     * @param list<int> $deckIds
     *
     * @return array<string, array<string, int>> deck id => oracle id => quantity
     */
    public function findMembershipWithQuantities(array $deckIds): array
    {
        if ([] === $deckIds) {
            return [];
        }

        $out = [];
        foreach (array_chunk($deckIds, 200) as $chunk) {
            $rows = $this->getEntityManager()->createQueryBuilder()
                ->select('IDENTITY(rc.referenceDeck) AS deckId', 'rc.oracleId AS oracleId', 'rc.quantity AS quantity')
                ->from(\App\Entity\ReferenceDeckCard::class, 'rc')
                ->andWhere('rc.referenceDeck IN (:decks)')
                ->setParameter('decks', $chunk)
                ->getQuery()
                ->getArrayResult();

            foreach ($rows as $row) {
                $out[(string) $row['deckId']][strtolower((string) $row['oracleId'])] = (int) $row['quantity'];
            }
        }

        return $out;
    }

    /**
     * Deck ids in the requested scope, ordered by relevance.
     *
     * Strategy filtering runs in SQL against the JSON `strategy_ids` column so
     * we never load and discard decks in PHP.
     *
     * @return list<int>
     */
    public function relevantDeckIds(Uuid $commanderOracleId, ?string $strategyId, int $limit = 10): array
    {
        $qb = $this->createQueryBuilder('d')
            ->select('d.id')
            ->andWhere('d.commanderOracleId = :commander')
            ->setParameter('commander', $commanderOracleId)
            ->orderBy('d.popularity', 'DESC')
            ->addOrderBy('d.id', 'ASC')
            ->setMaxResults(max(1, $limit));

        if (null !== $strategyId) {
            $qb->andWhere('CAST_AS_TEXT(d.strategyIds) LIKE :strategy')
                ->setParameter('strategy', '%"'.$strategyId.'"%');
        }

        return array_map('intval', $qb->getQuery()->getSingleColumnResult());
    }

    public function countForCommander(Uuid $commanderOracleId, ?string $strategyId = null): int
    {
        $qb = $this->createQueryBuilder('d')
            ->select('COUNT(d.id)')
            ->andWhere('d.commanderOracleId = :commander')
            ->setParameter('commander', $commanderOracleId);

        if (null !== $strategyId) {
            $qb->andWhere('CAST_AS_TEXT(d.strategyIds) LIKE :strategy')
                ->setParameter('strategy', '%"'.$strategyId.'"%');
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * Reference decks whose card rows can be dropped: the aggregates derived
     * from them are already stored, so keeping the raw lists only costs space.
     *
     * @return list<int>
     */
    public function findPrunableDeckIds(\DateTimeImmutable $fetchedBefore, int $limit = 500): array
    {
        return array_map('intval', $this->createQueryBuilder('d')
            ->select('d.id')
            ->andWhere('d.fetchedAt < :before')
            ->setParameter('before', $fetchedBefore)
            ->orderBy('d.fetchedAt', 'ASC')
            ->setMaxResults(max(1, $limit))
            ->getQuery()
            ->getSingleColumnResult());
    }

    /**
     * @param list<int> $deckIds
     */
    public function deleteCardsForDeckIds(array $deckIds): int
    {
        if ([] === $deckIds) {
            return 0;
        }

        $deleted = 0;
        foreach (array_chunk($deckIds, 200) as $chunk) {
            $deleted += (int) $this->getEntityManager()->createQueryBuilder()
                ->delete(\App\Entity\ReferenceDeckCard::class, 'rc')
                ->andWhere('IDENTITY(rc.referenceDeck) IN (:ids)')
                ->setParameter('ids', $chunk)
                ->getQuery()
                ->execute();
        }

        return $deleted;
    }

    /**
     * @param list<int> $deckIds
     */
    public function deleteDecksByIds(array $deckIds): int
    {
        if ([] === $deckIds) {
            return 0;
        }

        $deleted = 0;
        foreach (array_chunk($deckIds, 200) as $chunk) {
            $deleted += (int) $this->createQueryBuilder('d')
                ->delete()
                ->andWhere('d.id IN (:ids)')
                ->setParameter('ids', $chunk)
                ->getQuery()
                ->execute();
        }

        return $deleted;
    }
}
