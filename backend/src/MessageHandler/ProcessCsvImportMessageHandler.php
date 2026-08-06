<?php

namespace App\MessageHandler;

use App\Entity\Card;
use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Enum\CardCondition;
use App\Message\ProcessCsvImportMessage;
use App\Repository\CsvImportJobRepository;
use App\Repository\CsvImportRowRepository;
use App\Repository\CardRepository;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\FinishVocabulary;
use App\Service\CsvImport\SealedImportProcessor;
use App\Service\Doctrine\SqlDebugLogPruner;
use App\Service\Inventory\StoreInventoryWriter;
use App\Service\Scryfall\ScryfallClient;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\OptimisticLockException;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Messenger\Stamp\DelayStamp;

#[AsMessageHandler]
final readonly class ProcessCsvImportMessageHandler
{
    /**
     * A PROCESSING row whose claim is older than this is considered
     * abandoned (crashed handler) and safe to requeue. Rows with fresher
     * claims belong to a live handler and must not be stolen — requeueing
     * them lets a second worker import the same rows and double inventory.
     */
    private const STALE_CLAIM_SECONDS = 600;

    /** Delay before re-checking a job whose rows are freshly claimed elsewhere. */
    private const LIVENESS_RECHECK_DELAY_MS = 60_000;

    public function __construct(
        private CsvImportJobRepository $jobRepository,
        private CsvImportRowRepository $rowRepository,
        private CatalogCardResolver $catalogCardResolver,
        private CardRepository $cardRepository,
        private SealedImportProcessor $sealedImportProcessor,
        private ScryfallClient $scryfallClient,
        private StoreInventoryWriter $inventoryWriter,
        private \App\Service\Import\ImportLogger $importLogger,
        private SqlDebugLogPruner $sqlDebugLogPruner,
        private EntityManagerInterface $entityManager,
        private ManagerRegistry $managerRegistry,
        private MessageBusInterface $messageBus,
    ) {
    }

    public function __invoke(ProcessCsvImportMessage $message): void
    {
        // One worker process handles batch after batch. In debug mode every
        // query (with backtrace) is retained for the profiler, so without
        // this a long import kills the worker with an out-of-memory fatal
        // and leaves its job stuck in PROCESSING.
        $this->sqlDebugLogPruner->prune();

        $job = $this->jobRepository->find($message->jobId);
        if (!$job instanceof CsvImportJob) {
            return;
        }

        if (in_array($job->getStatus(), [CsvImportJob::STATUS_COMPLETED, CsvImportJob::STATUS_PAUSED, CsvImportJob::STATUS_CANCELLED], true)) {
            return;
        }

        $store = $job->getStore();
        if (null === $store) {
            $job->setStatus(CsvImportJob::STATUS_FAILED);
            $job->setErrorMessage('Store not found.');
            $job->setFinishedAt(new \DateTimeImmutable());
            $this->entityManager->flush();
            return;
        }

        $claimedRowIds = [];

        try {
            // Guarded transition: only QUEUED/PROCESSING may become PROCESSING.
            // A pause/cancel committed between the entity load above and this
            // statement wins — the blind setStatus+flush used before silently
            // overwrote a concurrent PAUSED and the import kept running.
            if (!$this->markJobProcessing($job)) {
                return;
            }
            $this->syncCounters($job);
            $this->entityManager->flush();

            $batchSize = 40;
            // Atomically claim the next batch so concurrent handlers never collide.
            $rows = $this->rowRepository->claimNextQueued($job, $batchSize);
            if ([] === $rows) {
                $this->completeJob($job);
                return;
            }
            $claimedRowIds = array_map(static fn (CsvImportRow $row): int => (int) $row->getId(), $rows);
            $this->importLogger->log($job, 'batch_claimed', ['rows' => count($rows)]);
            $imported = 0;
            $failed = 0;

            // Sealed sheets resolve against the local sealed catalog and write
            // to the store's sealed inventory — a different pipeline entirely
            // from singles, so it short-circuits the card path below.
            if ($job->isSealedImport()) {
                $result = $this->sealedImportProcessor->processBatch($job, $store, $rows);
                $this->importLogger->log($job, 'batch_processed', $result);
                $this->flushBatchAndQueueNext($job);

                return;
            }

            // Resolve the whole batch up front: local natural-key matches first,
            // then ONE Scryfall collection call (75 identifiers per request) for
            // the misses — instead of a rate-limited search round-trip per row.
            // Magic only: other games resolve per row against their local
            // catalog below, and their ids mean nothing to Scryfall.
            $isMagicJob = null === $job->getGame() || $job->getGame()->isMtg();
            $preResolved = $isMagicJob ? $this->preResolveRows($rows) : [];

            /** @var list<array{CsvImportRow, \App\Entity\InventoryItem}> $pendingItemLinks */
            $pendingItemLinks = [];

            foreach ($rows as $row) {
                // Rows are already marked PROCESSING by claimNextQueued().
                $row->setError(null);
                $card = $preResolved[spl_object_id($row)] ?? null;

                $jobGame = $job->getGame();
                if (!$card instanceof Card && null !== $jobGame && !$jobGame->isMtg()) {
                    // Non-Magic games have a purely local catalog (TCGCSV), so
                    // resolution stays local — Scryfall knows nothing here.
                    $card = $this->cardRepository->findOneForGame(
                        $jobGame,
                        $row->getName(),
                        $row->getSetCode(),
                        $row->getCollectorNumber(),
                    );

                    if (!$card instanceof Card) {
                        $row->setStatus(CsvImportRow::STATUS_ERROR);
                        $row->setError($this->describeMissingCard($jobGame, $row));
                        ++$failed;
                        continue;
                    }
                }

                if (!$card instanceof Card) {
                    // Slow path for rows the batch couldn't place: full resolver
                    // (local → Scryfall search → MTGJSON) with its error detail.
                    $resolution = $this->catalogCardResolver->resolve(
                        $row->getName(),
                        $row->getSetCode(),
                        $row->getCollectorNumber(),
                        $row->getRarity(),
                        $row->isFoil() ? 'foil' : 'nonfoil',
                    );

                    if (!$resolution->isResolved() || !$resolution->card instanceof Card) {
                        $row->setStatus(CsvImportRow::STATUS_ERROR);
                        $row->setError($resolution->error ?? 'No matching MTGJSON or Scryfall printing found.');
                        ++$failed;
                        $this->importLogger->log($job, 'row_failed', [
                            'rowIndex' => $row->getRowIndex(),
                            'name' => $row->getName(),
                            'set' => $row->getSetCode(),
                            'collectorNumber' => $row->getCollectorNumber(),
                            'error' => $row->getError(),
                        ], 'warning');
                        continue;
                    }

                    $card = $resolution->card;
                }

                // "Game: Magic" is pure noise on an MTG platform (it ends up
                // printed on every inventory tile); only keep a game note when
                // it names something else.
                $notes = [
                    '' !== $row->getGame() && !CsvImportRow::isMagicGame($row->getGame()) ? 'Game: '.$row->getGame() : '',
                    '' !== $row->getVariant() ? 'Variant: '.$row->getVariant() : '',
                ];
                $notes = implode("\n", array_values(array_filter($notes)));
                $condition = CardCondition::tryFrom($row->getCondition()) ?? CardCondition::NM;
                $quantity = max(0, $row->getQuantity());

                $item = $this->inventoryWriter->write(
                    $store,
                    $card,
                    $quantity,
                    $condition,
                    FinishVocabulary::resolveForCard(
                        $card,
                        FinishVocabulary::isGeneric($row->getFinish()) ? null : $row->getFinish(),
                        $row->isFoil(),
                    ),
                    '' !== $notes ? $notes : null,
                    false,
                );

                $row->setStatus(CsvImportRow::STATUS_IMPORTED);
                $row->setCard($this->serializeImportCard($card));
                $row->setImportedItemId($item->getId());
                ++$imported;
                if (null === $item->getId()) {
                    // Freshly created items have no id until the batch flush;
                    // link them afterwards so the row always references its item.
                    $pendingItemLinks[] = [$row, $item];
                }
            }

            $this->importLogger->log($job, 'batch_processed', ['imported' => $imported, 'failed' => $failed]);
            $this->flushBatchAndQueueNext($job, $pendingItemLinks);
        } catch (UniqueConstraintViolationException|OptimisticLockException $e) {
            // Two workers raced on the same inventory line (same store/card/
            // condition/foil tuple in two batches) — the batch flush rolled
            // back. The data conflict is transient: requeue OUR claimed rows
            // and retry; the re-run will find the winner's row and merge.
            $this->importLogger->log($job, 'batch_contended_retry', ['rows' => count($claimedRowIds)], 'warning');
            $this->recoverContendedBatch($message->jobId, $claimedRowIds);
        } catch (\Throwable $e) {
            $this->importLogger->log($job, 'batch_error', ['error' => $e->getMessage()], 'error');
            $this->markJobFailed($message->jobId, $e);
        }
    }

    /**
     * Turns "not found" into something a store owner can act on. A bare "no
     * card named X" is useless when the catalog holds a near-identical name
     * or the same card in a different set — so say what is actually there.
     */
    private function describeMissingCard(\App\Entity\Game $game, CsvImportRow $row): string
    {
        $namesakes = $this->cardRepository->findNamesakesForGame($game, $row->getName());

        if ([] !== $namesakes) {
            $shown = array_map(
                static fn (Card $card): string => sprintf(
                    '%s (%s #%s)',
                    $card->getName(),
                    $card->getSetCode(),
                    $card->getCollectorNumber(),
                ),
                $namesakes,
            );

            return sprintf(
                'No exact match for "%s"%s. The catalog does have: %s. Check the name, set, or collector number on this row.',
                $row->getName(),
                '' !== $row->getSetCode() ? sprintf(' in "%s"', $row->getSetCode()) : '',
                implode('; ', $shown),
            );
        }

        return sprintf(
            'No %s card named "%s" in the catalog. If this game was never synced, run a catalog sync; otherwise check the name and set.',
            $game->getName(),
            $row->getName(),
        );
    }


    /**
     * Atomic QUEUED/PROCESSING → PROCESSING transition. Returns false when a
     * concurrent pause/cancel/completion owns the job now.
     */
    private function markJobProcessing(CsvImportJob $job): bool
    {
        $affected = $this->entityManager->getConnection()->executeStatement(
            'UPDATE csv_import_jobs SET status = :processing, started_at = COALESCE(started_at, NOW()) WHERE id = :id AND status IN (:queued, :processing)',
            [
                'processing' => CsvImportJob::STATUS_PROCESSING,
                'id' => (int) $job->getId(),
                'queued' => CsvImportJob::STATUS_QUEUED,
            ],
        );

        $this->entityManager->refresh($job);

        return $affected > 0;
    }

    /** @param list<int> $claimedRowIds */
    private function recoverContendedBatch(int $jobId, array $claimedRowIds): void
    {
        $manager = $this->entityManager->isOpen()
            ? $this->entityManager
            : $this->managerRegistry->resetManager();

        if ([] !== $claimedRowIds) {
            $manager->getConnection()->executeStatement(
                'UPDATE csv_import_rows SET status = :queued, claimed_at = NULL, error = NULL WHERE id IN (:ids) AND status = :processing',
                [
                    'queued' => CsvImportRow::STATUS_QUEUED,
                    'ids' => $claimedRowIds,
                    'processing' => CsvImportRow::STATUS_PROCESSING,
                ],
                [
                    'ids' => \Doctrine\DBAL\ArrayParameterType::INTEGER,
                ],
            );
        }

        $this->messageBus->dispatch(new ProcessCsvImportMessage($jobId));
    }

    /**
     * Batch card resolution for a claimed set of rows.
     *
     * Phase 1 matches each row against the local catalog by natural key
     * (indexed set + collector number). Phase 2 sends all remaining rows to
     * Scryfall's collection endpoint in chunks of 75 identifiers — turning
     * up to N rate-limited searches into ceil(N/75) requests. Anything still
     * unmatched falls through to the caller's per-row resolver.
     *
     * @param list<CsvImportRow> $rows
     *
     * @return array<int, Card> keyed by spl_object_id() of the row
     */
    private function preResolveRows(array $rows): array
    {
        $resolved = [];
        $missing = [];

        foreach ($rows as $row) {
            $finish = $row->isFoil() ? 'foil' : 'nonfoil';
            $setCode = $this->catalogCardResolver->normalizeSetCode($row->getSetCode());
            $card = $this->catalogCardResolver->matchLocal(
                $row->getName(),
                $setCode,
                $row->getCollectorNumber(),
                $row->getRarity(),
                $finish,
            );

            if ($card instanceof Card) {
                $resolved[spl_object_id($row)] = $card;
                continue;
            }

            if ('' !== trim($setCode) && '' !== trim($row->getCollectorNumber())) {
                $missing[] = $row;
            }
        }

        if ([] === $missing) {
            return $resolved;
        }

        $identifiers = [];
        foreach ($missing as $row) {
            $identifiers[] = [
                'set' => $this->catalogCardResolver->normalizeSetCode($row->getSetCode()),
                'collectorNumber' => $row->getCollectorNumber(),
            ];
        }

        try {
            $fetched = $this->scryfallClient->fetchCollectionBySetCollectors($identifiers);
        } catch (\Throwable) {
            // Batch fetch is an optimisation; rows fall back to per-row resolution.
            return $resolved;
        }

        foreach ($missing as $row) {
            $setCode = $this->catalogCardResolver->normalizeSetCode($row->getSetCode());
            $card = $fetched[ScryfallClient::collectionKey($setCode, $row->getCollectorNumber())] ?? null;
            if ($card instanceof Card && $this->catalogCardResolver->isAcceptableMatch(
                $card,
                $row->getName(),
                $setCode,
                $row->getCollectorNumber(),
                $row->getRarity(),
                $row->isFoil() ? 'foil' : 'nonfoil',
            )) {
                $resolved[spl_object_id($row)] = $card;
            }
        }

        return $resolved;
    }

    /** @return array<string, mixed> */
    private function serializeImportCard(Card $card): array
    {
        return [
            'id' => (string) $card->getId(),
            'oracleId' => (string) $card->getOracleId(),
            'name' => $card->getName(),
            'setCode' => $card->getSetCode(),
            'collectorNumber' => $card->getCollectorNumber(),
            'rarity' => $card->getRarity(),
            'imageUrl' => $card->getImageUrl(),
            'imageUris' => $card->getImageUris(),
            'prices' => $card->getPrices(),
        ];
    }

    /** @param list<array{CsvImportRow, \App\Entity\InventoryItem}> $pendingItemLinks */
    private function flushBatchAndQueueNext(CsvImportJob $job, array $pendingItemLinks = []): void
    {
        $this->syncCounters($job);
        $this->entityManager->flush();

        // Newly created inventory items received their ids in the flush above;
        // backfill the imported_item_id on rows that pointed at them.
        $linked = false;
        foreach ($pendingItemLinks as [$row, $item]) {
            if (null !== $item->getId() && $row->getImportedItemId() !== $item->getId()) {
                $row->setImportedItemId($item->getId());
                $linked = true;
            }
        }
        if ($linked) {
            $this->entityManager->flush();
        }

        $this->entityManager->refresh($job);

        if (CsvImportJob::STATUS_PROCESSING !== $job->getStatus()) {
            return;
        }

        if ($this->rowRepository->countByStatus($job)['queued'] > 0) {
            $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));
            return;
        }

        $this->completeJob($job);
    }

    /**
     * Marks the job completed only when no rows remain queued or processing.
     *
     * PROCESSING rows are only requeued when their claim is STALE (crashed/
     * abandoned handler); rows freshly claimed by a live handler are left
     * alone — that handler drives progress — and a delayed re-check message
     * keeps the job live in case that handler dies mid-batch. Completion
     * itself is a guarded PROCESSING → COMPLETED transition so it can never
     * overwrite a concurrent pause/cancel.
     */
    private function completeJob(CsvImportJob $job): void
    {
        $counts = $this->rowRepository->countByStatus($job);

        if ($counts['processing'] > 0) {
            $cutoff = new \DateTimeImmutable(sprintf('-%d seconds', self::STALE_CLAIM_SECONDS));
            $requeued = $this->rowRepository->requeueProcessingRows($job, $cutoff);
            $this->syncCounters($job);
            $this->entityManager->flush();

            if ($requeued > 0) {
                $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));
            } else {
                $this->messageBus->dispatch(
                    new ProcessCsvImportMessage((int) $job->getId()),
                    [new DelayStamp(self::LIVENESS_RECHECK_DELAY_MS)],
                );
            }

            return;
        }

        if ($counts['queued'] > 0) {
            $this->syncCounters($job);
            $this->entityManager->flush();
            $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));
            return;
        }

        $this->syncCounters($job);
        $this->entityManager->flush();

        // Guarded completion: only a job still PROCESSING may become COMPLETED.
        $this->entityManager->getConnection()->executeStatement(
            'UPDATE csv_import_jobs SET status = :completed, finished_at = NOW() WHERE id = :id AND status = :processing',
            [
                'completed' => CsvImportJob::STATUS_COMPLETED,
                'id' => (int) $job->getId(),
                'processing' => CsvImportJob::STATUS_PROCESSING,
            ],
        );
        $this->entityManager->refresh($job);

        if (CsvImportJob::STATUS_COMPLETED === $job->getStatus()) {
            $this->importLogger->log($job, 'completed', [
                'imported' => $job->getImportedRows(),
                'failed' => $job->getFailedRows(),
                'total' => $job->getTotalRows(),
            ]);
        }
    }

    private function syncCounters(CsvImportJob $job): void
    {
        $counts = $this->rowRepository->countByStatus($job);
        $job->setImportedRows($counts['imported']);
        $job->setFailedRows($counts['error']);
        $job->setProcessedRows($counts['imported'] + $counts['error']);
    }

    private function markJobFailed(int $jobId, \Throwable $e): void
    {
        $manager = $this->entityManager->isOpen()
            ? $this->entityManager
            : $this->managerRegistry->resetManager();

        $job = $manager->getRepository(CsvImportJob::class)->find($jobId);
        if (!$job instanceof CsvImportJob) {
            return;
        }

        // Never overwrite a terminal state a user/other worker already set.
        if (in_array($job->getStatus(), [CsvImportJob::STATUS_COMPLETED, CsvImportJob::STATUS_CANCELLED], true)) {
            return;
        }

        $job->setStatus(CsvImportJob::STATUS_FAILED);
        $job->setErrorMessage($this->formatFailureMessage($e));
        $job->setFinishedAt(new \DateTimeImmutable());
        $manager->flush();

        $this->importLogger->log($job, 'failed', ['error' => $this->formatFailureMessage($e)], 'error');
    }

    private function formatFailureMessage(\Throwable $e): string
    {
        $message = $e->getMessage();
        if (strlen($message) <= 250) {
            return $message;
        }

        return substr($message, 0, 247).'...';
    }
}
