<?php

namespace App\Repository;

use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\ParameterType;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<CsvImportRow> */
class CsvImportRowRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CsvImportRow::class);
    }

    /** @return list<CsvImportRow> */
    public function findWindow(CsvImportJob $job, int $offset, int $limit, ?string $status = null): array
    {
        $qb = $this->createQueryBuilder('row')
            ->andWhere('row.job = :job')
            ->setParameter('job', $job)
            ->orderBy('row.rowIndex', 'ASC')
            ->setFirstResult($offset)
            ->setMaxResults($limit);

        if (null !== $status) {
            $qb->andWhere('row.status = :status')->setParameter('status', $status);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * All rows in any of the given statuses, in sheet order.
     *
     * Backs the recovery queue, which shows failed and skipped rows together
     * so a skipped row stays visible (and restorable) instead of vanishing.
     *
     * @param list<string> $statuses
     *
     * @return list<CsvImportRow>
     */
    public function findByStatuses(CsvImportJob $job, array $statuses, int $limit = 0, int $offset = 0): array
    {
        if ([] === $statuses) {
            return [];
        }

        $qb = $this->createQueryBuilder('row')
            ->andWhere('row.job = :job')
            ->andWhere('row.status IN (:statuses)')
            ->setParameter('job', $job)
            ->setParameter('statuses', $statuses)
            ->orderBy('row.rowIndex', 'ASC');

        if ($limit > 0) {
            $qb->setFirstResult(max(0, $offset))->setMaxResults($limit);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Lightweight error index for grouping — no card JSON.
     *
     * @return list<array{rowIndex: int, error: ?string}>
     */
    public function findErrorSummaries(CsvImportJob $job): array
    {
        return $this->createQueryBuilder('row')
            ->select('row.rowIndex AS rowIndex, row.error AS error')
            ->andWhere('row.job = :job')
            ->andWhere('row.status = :status')
            ->setParameter('job', $job)
            ->setParameter('status', CsvImportRow::STATUS_ERROR)
            ->orderBy('row.rowIndex', 'ASC')
            ->getQuery()
            ->getArrayResult();
    }

    /** @return list<CsvImportRow> */
    public function findNextQueued(CsvImportJob $job, int $limit): array
    {
        return $this->findWindow($job, 0, $limit, CsvImportRow::STATUS_QUEUED);
    }

    /**
     * Atomically claim the next batch of queued rows for a job, marking them as
     * PROCESSING so that two concurrent handlers can never grab the same rows.
     *
     * Uses `SELECT ... FOR UPDATE SKIP LOCKED` (MySQL 8 / PostgreSQL) inside a
     * transaction so locked rows are skipped instead of blocking. Falls back to a
     * plain locking SELECT on drivers that do not support SKIP LOCKED.
     *
     * @return list<CsvImportRow>
     */
    public function claimNextQueued(CsvImportJob $job, int $limit): array
    {
        if ($limit < 1) {
            return [];
        }

        $entityManager = $this->getEntityManager();
        $connection = $entityManager->getConnection();
        $platform = $connection->getDatabasePlatform();
        // SKIP LOCKED is supported on MySQL 8+ and PostgreSQL; detect by platform class
        // (DBAL 4 removed AbstractPlatform::getName()).
        $supportsSkipLocked = $platform instanceof \Doctrine\DBAL\Platforms\AbstractMySQLPlatform
            || $platform instanceof \Doctrine\DBAL\Platforms\PostgreSQLPlatform;

        return $entityManager->wrapInTransaction(function () use ($job, $limit, $connection, $supportsSkipLocked): array {
            /** @noinspection SqlNoDataSourceInspection */
            $sql = 'SELECT id FROM csv_import_rows WHERE job_id = :job AND status = :status ORDER BY row_index ASC LIMIT :limit FOR UPDATE';
            if ($supportsSkipLocked) {
                $sql .= ' SKIP LOCKED';
            }

            $ids = $connection->executeQuery(
                $sql,
                [
                    'job' => $job->getId(),
                    'status' => CsvImportRow::STATUS_QUEUED,
                    'limit' => $limit,
                ],
                [
                    'job' => ParameterType::INTEGER,
                    'status' => ParameterType::STRING,
                    'limit' => ParameterType::INTEGER,
                ],
            )->fetchFirstColumn();

            if ([] === $ids) {
                return [];
            }

            $ids = array_map('intval', $ids);

            /** @noinspection SqlNoDataSourceInspection */
            $connection->executeStatement(
                'UPDATE csv_import_rows SET status = :processing, claimed_at = NOW() WHERE id IN (:ids)',
                [
                    'processing' => CsvImportRow::STATUS_PROCESSING,
                    'ids' => $ids,
                ],
                [
                    'processing' => ParameterType::STRING,
                    'ids' => ArrayParameterType::INTEGER,
                ],
            );

            $rows = $this->createQueryBuilder('row')
                ->andWhere('row.id IN (:ids)')
                ->setParameter('ids', $ids, ArrayParameterType::INTEGER)
                ->orderBy('row.rowIndex', 'ASC')
                ->getQuery()
                ->getResult();

            // Refresh so the managed entities reflect the committed PROCESSING status.
            $manager = $this->getEntityManager();
            foreach ($rows as $row) {
                $manager->refresh($row);
            }

            return $rows;
        });
    }

    /**
     * The row a "recovered from CSV import row #N in import #J" note points
     * at. The note is 1-based for humans; storage is 0-based.
     */
    public function findByNoteReference(int $jobId, int $oneBasedRow): ?CsvImportRow
    {
        return $this->findOneBy(['job' => $jobId, 'rowIndex' => $oneBasedRow - 1]);
    }

    /** @return array{queued: int, processing: int, imported: int, error: int, skipped: int} */
    public function countByStatus(CsvImportJob $job): array
    {
        $counts = [
            CsvImportRow::STATUS_QUEUED => 0,
            CsvImportRow::STATUS_PROCESSING => 0,
            CsvImportRow::STATUS_IMPORTED => 0,
            CsvImportRow::STATUS_ERROR => 0,
            CsvImportRow::STATUS_SKIPPED => 0,
        ];

        $rows = $this->createQueryBuilder('row')
            ->select('row.status status, COUNT(row.id) rowCount')
            ->andWhere('row.job = :job')
            ->setParameter('job', $job)
            ->groupBy('row.status')
            ->getQuery()
            ->getArrayResult();

        foreach ($rows as $row) {
            $status = (string) ($row['status'] ?? '');
            if (array_key_exists($status, $counts)) {
                $counts[$status] = (int) $row['rowCount'];
            }
        }

        return [
            'queued' => $counts[CsvImportRow::STATUS_QUEUED],
            'processing' => $counts[CsvImportRow::STATUS_PROCESSING],
            'imported' => $counts[CsvImportRow::STATUS_IMPORTED],
            'error' => $counts[CsvImportRow::STATUS_ERROR],
            'skipped' => $counts[CsvImportRow::STATUS_SKIPPED],
        ];
    }

    /**
     * Write imported/failed/processed from live row statuses.
     *
     * Skipped rows are settled work: they count as processed so a run the
     * operator emptied via skip can reach 100%. When $completeIfSettled is
     * true and nothing remains queued, processing, or failed, the job is
     * marked completed.
     *
     * @return array{queued: int, processing: int, imported: int, error: int, skipped: int}
     */
    public function syncJobCounters(CsvImportJob $job, bool $completeIfSettled = false): array
    {
        $counts = $this->countByStatus($job);
        $job->setImportedRows($counts['imported']);
        $job->setFailedRows($counts['error']);
        $job->setProcessedRows($counts['imported'] + $counts['error'] + $counts['skipped']);

        if (CsvImportJob::STATUS_CANCELLED === $job->getStatus()) {
            return $counts;
        }

        if (
            $completeIfSettled
            && 0 === $counts['queued']
            && 0 === $counts['processing']
            && 0 === $counts['error']
        ) {
            $job->setStatus(CsvImportJob::STATUS_COMPLETED);
            $job->setErrorMessage(null);
            $job->setFinishedAt(new \DateTimeImmutable());
        } elseif (
            $completeIfSettled
            && $counts['error'] > 0
            && CsvImportJob::STATUS_COMPLETED === $job->getStatus()
        ) {
            // Unskip after a skip-to-complete: there is work again, so the
            // run must leave "completed" or the Fix CTA never comes back.
            $job->setStatus(CsvImportJob::STATUS_FAILED);
            $job->setFinishedAt(null);
        }

        return $counts;
    }

    public function retryFailedRows(CsvImportJob $job): int
    {
        return $this->createQueryBuilder('row')
            ->update()
            ->set('row.status', ':queued')
            ->set('row.error', ':error')
            ->set('row.card', ':card')
            ->set('row.importedItemId', ':importedItemId')
            ->andWhere('row.job = :job')
            ->andWhere('row.status = :failed')
            ->setParameter('queued', CsvImportRow::STATUS_QUEUED)
            ->setParameter('error', null)
            ->setParameter('card', null)
            ->setParameter('importedItemId', null)
            ->setParameter('job', $job)
            ->setParameter('failed', CsvImportRow::STATUS_ERROR)
            ->getQuery()
            ->execute();
    }

    /**
     * Requeues PROCESSING rows back to QUEUED.
     *
     * With $claimedBefore set, only rows whose claim is older than the
     * cutoff (or has no timestamp — legacy rows) are requeued. This is how
     * job-completion logic recovers rows abandoned by a crashed handler
     * WITHOUT stealing rows a live handler claimed moments ago — requeueing
     * live rows lets a second worker import them in parallel and the
     * inventory quantities double.
     */
    public function requeueProcessingRows(CsvImportJob $job, ?\DateTimeImmutable $claimedBefore = null): int
    {
        $qb = $this->createQueryBuilder('row')
            ->update()
            ->set('row.status', ':queued')
            ->set('row.claimedAt', ':nullClaim')
            ->andWhere('row.job = :job')
            ->andWhere('row.status = :processing')
            ->setParameter('queued', CsvImportRow::STATUS_QUEUED)
            ->setParameter('nullClaim', null)
            ->setParameter('job', $job)
            ->setParameter('processing', CsvImportRow::STATUS_PROCESSING);

        if (null !== $claimedBefore) {
            $qb->andWhere('row.claimedAt IS NULL OR row.claimedAt < :claimedBefore')
                ->setParameter('claimedBefore', $claimedBefore);
        }

        return $qb->getQuery()->execute();
    }
}
