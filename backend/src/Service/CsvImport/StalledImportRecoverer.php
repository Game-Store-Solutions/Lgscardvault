<?php

namespace App\Service\CsvImport;

use App\Entity\CsvImportJob;
use App\Entity\Store;
use App\Message\ProcessCsvImportMessage;
use App\Repository\CsvImportJobRepository;
use App\Repository\CsvImportRowRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

/**
 * Puts imports back on the rails when the worker handling them died.
 *
 * A crashed worker (out of memory, restart, deploy) leaves its job at
 * PROCESSING with a batch of rows claimed but never finished, and nothing
 * requeues them — the import simply appears frozen. This finds those jobs,
 * releases the abandoned claims, and dispatches a fresh message so the
 * remaining rows are picked up.
 *
 * Only genuinely stalled jobs are touched: a live worker updates its job on
 * every batch, so anything that moved recently is left alone.
 */
final readonly class StalledImportRecoverer
{
    /** No progress for this long means nobody is working the job. */
    public const STALLED_AFTER_SECONDS = 600;

    public function __construct(
        private CsvImportJobRepository $jobRepository,
        private CsvImportRowRepository $rowRepository,
        private EntityManagerInterface $entityManager,
        private MessageBusInterface $messageBus,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return int number of jobs requeued
     */
    public function recoverForStore(Store $store): int
    {
        $threshold = new \DateTimeImmutable(sprintf('-%d seconds', self::STALLED_AFTER_SECONDS));
        $stalled = $this->jobRepository->findStalledForStore($store, $threshold);
        if ([] === $stalled) {
            return 0;
        }

        foreach ($stalled as $job) {
            // Release only claims old enough to be abandoned, so a worker
            // that is merely slow never has its in-flight rows stolen.
            $this->rowRepository->requeueProcessingRows($job, $threshold);
            $job->setStatus(CsvImportJob::STATUS_QUEUED);
            $job->setErrorMessage(null);

            $this->logger->warning('Requeued stalled import {job} for store {store}.', [
                'job' => $job->getId(),
                'store' => $store->getSlug(),
            ]);
        }

        $this->entityManager->flush();

        // Dispatch after the flush so the worker cannot pick a job up before
        // its rows are back in the queue.
        foreach ($stalled as $job) {
            $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));
        }

        return count($stalled);
    }
}
