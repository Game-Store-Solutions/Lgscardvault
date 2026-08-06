<?php

namespace App\Service\CsvImport;

use App\Entity\CsvImportJob;
use App\Entity\Store;
use App\Message\ProcessCsvImportMessage;
use App\Repository\CsvImportJobRepository;
use App\Repository\CsvImportRowRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Messenger\MessageBusInterface;

/**
 * Re-dispatches import work when rows are waiting but nobody is processing them.
 *
 * After each batch the handler queues the next message; if the worker process
 * died (OOM, dev restart), those messages sit unconsumed while the job still
 * looks "live" because updatedAt was touched seconds ago. Polling the imports
 * UI calls this with a short idle threshold so work resumes without waiting
 * for the long stalled-job recoverer.
 */
final readonly class CsvImportWorkerKick
{
    private const IDLE_KICK_SECONDS_DEV = 20;
    private const IDLE_KICK_SECONDS_PROD = 90;

    public function __construct(
        private CsvImportJobRepository $jobRepository,
        private CsvImportRowRepository $rowRepository,
        private EntityManagerInterface $entityManager,
        private MessageBusInterface $messageBus,
        #[Autowire('%kernel.environment%')]
        private string $kernelEnvironment,
    ) {
    }

    /** @return int jobs that received a fresh worker message */
    public function kickIdleJobsForStore(Store $store): int
    {
        $threshold = new \DateTimeImmutable(sprintf(
            '-%d seconds',
            'dev' === $this->kernelEnvironment ? self::IDLE_KICK_SECONDS_DEV : self::IDLE_KICK_SECONDS_PROD,
        ));

        $kicked = 0;
        foreach ($this->jobRepository->findActiveForStore($store) as $job) {
            if ($this->kickJobIfIdle($job, $threshold)) {
                ++$kicked;
            }
        }

        if ($kicked > 0) {
            $this->entityManager->flush();
        }

        return $kicked;
    }

    private function kickJobIfIdle(CsvImportJob $job, \DateTimeImmutable $updatedBefore): bool
    {
        if (!in_array($job->getStatus(), [CsvImportJob::STATUS_QUEUED, CsvImportJob::STATUS_PROCESSING], true)) {
            return false;
        }

        if ($job->getUpdatedAt() > $updatedBefore) {
            return false;
        }

        $counts = $this->rowRepository->countByStatus($job);
        if ($counts['queued'] < 1 || $counts['processing'] > 0) {
            return false;
        }

        $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));
        $job->touch();

        return true;
    }
}
