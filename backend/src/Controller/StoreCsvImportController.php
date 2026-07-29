<?php

namespace App\Controller;

use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Entity\Card;
use App\Entity\Store;
use App\Enum\CardCondition;
use App\Message\ProcessCsvImportMessage;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\CsvImportJobRepository;
use App\Repository\CsvImportRowRepository;
use App\Repository\GameRepository;
use App\Repository\StoreRepository;
use App\Security\ApiRateLimit;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\FinishVocabulary;
use App\Service\CsvImport\CsvImportParser;
use App\Service\CsvImport\ImportPreviewer;
use App\Service\CsvImport\SealedCsvImportParser;
use App\Service\Inventory\StoreInventoryWriter;
use App\Service\Scryfall\ScryfallClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

#[Route('/api/stores/{slug}/csv-imports')]
final class StoreCsvImportController extends AbstractController
{
    private const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

    /** Failed-row preview window — bounds per-request Scryfall fan-out. */
    private const FAILED_PREVIEW_MAX_ROWS = 300;

    /** @var list<string> */
    private const ALLOWED_MIME_TYPES = [
        'text/csv',
        'text/plain',
        'application/csv',
        'application/vnd.ms-excel',
        'application/octet-stream',
    ];

    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly CardRepository $cardRepository,
        private readonly CsvImportJobRepository $jobRepository,
        private readonly CsvImportRowRepository $rowRepository,
        private readonly CatalogCardResolver $catalogCardResolver,
        private readonly CsvImportParser $parser,
        private readonly SealedCsvImportParser $sealedParser,
        private readonly ImportPreviewer $previewer,
        private readonly \App\Service\CsvImport\StalledImportRecoverer $stalledImportRecoverer,
        private readonly GameRepository $gameRepository,
        private readonly StoreInventoryWriter $inventoryWriter,
        private readonly ScryfallClient $scryfallClient,
        private readonly EntityManagerInterface $entityManager,
        private readonly MessageBusInterface $messageBus,
        private readonly \App\Service\Import\ImportLogger $importLogger,
        #[\Symfony\Component\DependencyInjection\Attribute\Autowire(service: 'limiter.csv_upload')]
        private readonly \Symfony\Component\RateLimiter\RateLimiterFactoryInterface $csvUploadLimiter,
    ) {
    }

    #[Route('', name: 'api_store_csv_import_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function create(Request $request, string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        // Throttle how often a store can START new imports (heavy: parse + queue
        // up to 50k rows). Does not affect the processing speed of an accepted
        // import — that runs in the worker.
        if (null !== $response = ApiRateLimit::enforce(
            $this->csvUploadLimiter,
            'store:'.$store->getId(),
            'Too many import uploads. Please wait a moment before uploading again.',
        )) {
            return $response;
        }

        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['detail' => 'A CSV file is required.'], 400);
        }

        // Validate the upload BEFORE reading it into memory.
        if (!$file->isValid()) {
            return $this->json(['detail' => 'The uploaded file is invalid or incomplete.'], 400);
        }

        $size = $file->getSize();
        if (null === $size || $size > self::MAX_UPLOAD_BYTES) {
            return $this->json(
                ['detail' => sprintf('CSV exceeds the maximum allowed size of %d MB.', self::MAX_UPLOAD_BYTES >> 20)],
                422,
            );
        }

        if (!$this->looksLikeCsv($file)) {
            return $this->json(['detail' => 'Only CSV files are accepted.'], 422);
        }

        $content = file_get_contents($file->getPathname());
        if (false === $content) {
            return $this->json(['detail' => 'Could not read the uploaded CSV.'], 400);
        }

        $game = $this->resolveGame($request);
        if (!$game instanceof Game) {
            return $this->json(['detail' => 'Unknown game. Pick a game before uploading.'], 422);
        }
        $importType = $this->resolveImportType($request);

        try {
            $parsed = CsvImportJob::TYPE_SEALED === $importType
                ? $this->sealedParser->parse($content)
                : $this->parser->parse($content);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $job = new CsvImportJob();
        $job->setStore($store);
        $job->setGame($game);
        $job->setImportType($importType);
        $job->setOriginalFilename($file->getClientOriginalName() ?: 'import.csv');
        // The pipeline processes persisted DB rows, not an on-disk copy, so we no
        // longer write the file to disk (avoids orphaned-file risk). The column is
        // kept for backwards compatibility and records the source filename only.
        $job->setStoragePath('');
        $job->setTotalRows(count($parsed['rows']));
        $job->setProcessedRows(0);
        $job->setImportedRows(0);
        $job->setFailedRows(count(array_filter($parsed['rows'], static fn (array $row): bool => 'error' === ($row['status'] ?? ''))));

        $this->entityManager->persist($job);
        foreach ($parsed['rows'] as $rowData) {
            $this->entityManager->persist($this->createImportRow($job, $rowData));
        }
        $this->entityManager->flush();

        $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));

        return $this->json($this->serializeJob($job, $request), 201);
    }

    /**
     * Wizard "Validate + Preview" step: parse the sheet and dry-run a sample
     * of its rows against the chosen game's catalog without persisting
     * anything, so staff can confirm the mapping before importing.
     */
    #[Route('/preview', name: 'api_store_csv_import_preview', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function preview(Request $request, string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['detail' => 'A CSV file is required.'], 400);
        }
        if (!$file->isValid()) {
            return $this->json(['detail' => 'The uploaded file is invalid or incomplete.'], 400);
        }

        $size = $file->getSize();
        if (null === $size || $size > self::MAX_UPLOAD_BYTES) {
            return $this->json(
                ['detail' => sprintf('CSV exceeds the maximum allowed size of %d MB.', self::MAX_UPLOAD_BYTES >> 20)],
                422,
            );
        }
        if (!$this->looksLikeCsv($file)) {
            return $this->json(['detail' => 'Only CSV files are accepted.'], 422);
        }

        $game = $this->resolveGame($request);
        if (!$game instanceof Game) {
            return $this->json(['detail' => 'Unknown game. Pick a game before uploading.'], 422);
        }

        $content = file_get_contents($file->getPathname());
        if (false === $content) {
            return $this->json(['detail' => 'Could not read the uploaded CSV.'], 400);
        }

        try {
            return $this->json($this->previewer->preview($content, $game, $this->resolveImportType($request)));
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    #[Route('', name: 'api_store_csv_import_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function list(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        // Jobs abandoned by a crashed worker are requeued here, so the list
        // never shows an import frozen at "processing" with nobody on it.
        $this->stalledImportRecoverer->recoverForStore($store);

        return $this->json(array_map(
            $this->serializeJobSummary(...),
            $this->jobRepository->findRecentByStore($store),
        ));
    }

    #[Route('/current', name: 'api_store_csv_import_current', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function current(Request $request, string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $this->stalledImportRecoverer->recoverForStore($store);

        $job = $this->jobRepository->findLatestByStore($store);
        if (null === $job) {
            return $this->json(null);
        }

        return $this->json($this->serializeJob($job, $request));
    }

    #[Route('/{id}', name: 'api_store_csv_import_show', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function show(Request $request, string $slug, int $id): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $job = $this->jobRepository->findOneByStoreAndId($store, $id);
        if (null === $job) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        return $this->json($this->serializeJob($job, $request));
    }

    #[Route('/{id}/pause', name: 'api_store_csv_import_pause', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function pause(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (in_array($job->getStatus(), [CsvImportJob::STATUS_QUEUED, CsvImportJob::STATUS_PROCESSING], true)) {
            $job->setStatus(CsvImportJob::STATUS_PAUSED);
            $this->entityManager->flush();
        }

        return $this->json($this->serializeJobSummary($job));
    }

    #[Route('/{id}/resume', name: 'api_store_csv_import_resume', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function resume(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if ($this->isActivelyProcessing($job)) {
            return $this->json(['detail' => 'Import is currently processing. Pause it or wait for the running batch to finish before resuming.'], 409);
        }

        if (in_array($job->getStatus(), [CsvImportJob::STATUS_PAUSED, CsvImportJob::STATUS_PROCESSING, CsvImportJob::STATUS_FAILED], true)) {
            $this->requeueJob($job);
        }

        return $this->json($this->serializeJobSummary($job));
    }

    #[Route('/{id}/retry', name: 'api_store_csv_import_retry', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function retry(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if ($this->isActivelyProcessing($job)) {
            return $this->json(['detail' => 'Import is currently processing. Pause it or wait for the running batch to finish before retrying.'], 409);
        }

        if (in_array($job->getStatus(), [CsvImportJob::STATUS_FAILED, CsvImportJob::STATUS_PAUSED, CsvImportJob::STATUS_PROCESSING], true)) {
            $this->requeueJob($job);
        }

        return $this->json($this->serializeJobSummary($job));
    }

    #[Route('/{id}/retry-failed', name: 'api_store_csv_import_retry_failed', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function retryFailed(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (CsvImportJob::STATUS_QUEUED === $job->getStatus() || $this->isActivelyProcessing($job)) {
            return $this->json(['detail' => 'Import is already running. Pause or wait for it to finish before retrying failed cards.'], 409);
        }

        $retriedRows = $this->rowRepository->retryFailedRows($job);

        if ($retriedRows > 0) {
            $job->setFailedRows(max(0, $job->getFailedRows() - $retriedRows));
            $job->setProcessedRows(max(0, $job->getProcessedRows() - $retriedRows));
            $this->requeueJob($job);
        }

        $this->importLogger->log($job, 'retry_failed_requested', ['requeued' => $retriedRows]);

        return $this->json($this->serializeJobSummary($job));
    }

    #[Route('/{id}/failed/preview', name: 'api_store_csv_import_failed_preview', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function previewFailedRows(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (CsvImportJob::STATUS_QUEUED === $job->getStatus() || $this->isActivelyProcessing($job)) {
            return $this->json(['detail' => 'Import is already running. Pause or wait for it to finish before resolving failed cards.'], 409);
        }

        // Bounded: each 75 identifiers cost one rate-limited Scryfall request,
        // so previewing ALL failed rows of a 50k-row job would pin a PHP
        // worker for minutes and drain the host-global API budget. Preview a
        // window; after finalizing, re-running the preview serves the rest.
        $rows = $this->rowRepository->findBy(
            ['job' => $job, 'status' => CsvImportRow::STATUS_ERROR],
            ['rowIndex' => 'ASC'],
            self::FAILED_PREVIEW_MAX_ROWS,
        );
        $totalFailed = $this->rowRepository->count(['job' => $job, 'status' => CsvImportRow::STATUS_ERROR]);

        // A non-Magic job resolves against ITS OWN game's catalog and nothing
        // else. Running these rows through the Scryfall cascade is how a
        // failed Pokemon row used to get "recovered" onto a Magic-shaped,
        // game-less card — poisoning the store with listings that sit on the
        // Magic shelf while their game's workspace cannot see them.
        $jobGame = $job->getGame();
        if ($jobGame instanceof Game && !$jobGame->isMtg()) {
            $results = [];
            foreach ($rows as $row) {
                $card = $this->cardRepository->findOneForGame(
                    $jobGame,
                    $row->getName(),
                    $row->getSetCode(),
                    $row->getCollectorNumber(),
                );

                $result = ['row' => $this->serializeRow($row)];
                if ($card instanceof Card) {
                    $result['card'] = $this->catalogCardResolver->serializeCard($card);
                } else {
                    $result['error'] = sprintf('No %s catalog match for this row.', $jobGame->getName());
                }
                $results[] = $result;
            }

            return $this->json([
                'results' => $results,
                'totalFailedRows' => $totalFailed,
                'remainingFailedRows' => max(0, $totalFailed - count($rows)),
            ]);
        }

        // Normalize set names → codes before hitting Scryfall's collection
        // endpoint: it only accepts codes, and CSVs often carry full names.
        $collectionMatches = $this->scryfallClient->fetchCollectionBySetCollectors(array_map(
            fn (CsvImportRow $row): array => [
                'set' => $this->catalogCardResolver->normalizeSetCode($row->getSetCode()),
                'collectorNumber' => $row->getCollectorNumber(),
            ],
            $rows,
        ));

        $results = [];
        foreach ($rows as $row) {
            $resolution = $this->catalogCardResolver->resolveForPreview(
                $row->getName(),
                $row->getSetCode(),
                $row->getCollectorNumber(),
                $row->getRarity(),
                $row->isFoil() ? 'foil' : 'nonfoil',
                false,
            );
            $card = $resolution->card;
            if (!$card instanceof Card) {
                $collectionMatch = $collectionMatches[$this->collectionMatchKey($row->getSetCode(), $row->getCollectorNumber())] ?? null;
                if (
                    $collectionMatch instanceof Card
                    && $this->catalogCardResolver->matchesFilters(
                        $collectionMatch,
                        $row->getSetCode(),
                        $row->getCollectorNumber(),
                        $row->getRarity(),
                        $row->isFoil() ? 'foil' : 'nonfoil',
                    )
                ) {
                    $card = $collectionMatch;
                }
            }

            $result = ['row' => $this->serializeRow($row)];
            if ($card instanceof Card) {
                $result['card'] = $this->catalogCardResolver->serializeCard($card);
            } else {
                $result['error'] = 'No matching local or Scryfall set/collector printing found.';
            }
            $results[] = $result;
        }

        return $this->json([
            'results' => $results,
            'totalFailedRows' => $totalFailed,
            'remainingFailedRows' => max(0, $totalFailed - count($rows)),
        ]);
    }

    #[Route('/{id}/failed/manual-import', name: 'api_store_csv_import_failed_manual_import', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function manualImportFailedRows(Request $request, string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (CsvImportJob::STATUS_QUEUED === $job->getStatus() || $this->isActivelyProcessing($job)) {
            return $this->json(['detail' => 'Import is already running. Pause or wait for it to finish before resolving failed cards.'], 409);
        }

        $store = $job->getStore();
        if (null === $store) {
            return $this->json(['detail' => 'Store not found for this import job.'], 409);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload) || !is_array($payload['items'] ?? null)) {
            return $this->json(['detail' => 'Request body must include an items array.'], 400);
        }

        $selected = [];
        $errors = [];
        foreach ($payload['items'] as $index => $item) {
            if (!is_array($item)) {
                $errors[] = ['index' => $index, 'detail' => 'Item must be an object.'];
                continue;
            }

            $rowIndex = (int) ($item['rowIndex'] ?? -1);
            $row = $this->rowRepository->findOneBy(['job' => $job, 'rowIndex' => $rowIndex]);
            if (!$row instanceof CsvImportRow || CsvImportRow::STATUS_ERROR !== $row->getStatus()) {
                $errors[] = ['rowIndex' => $rowIndex, 'detail' => 'Failed import row was not found.'];
                continue;
            }

            $cardId = (string) ($item['cardId'] ?? '');
            try {
                $card = '' !== $cardId ? $this->cardRepository->find(Uuid::fromString($cardId)) : null;
            } catch (\InvalidArgumentException) {
                $errors[] = ['rowIndex' => $rowIndex, 'detail' => 'Card id is invalid.'];
                continue;
            }

            if (!$card instanceof Card) {
                $errors[] = ['rowIndex' => $rowIndex, 'detail' => 'Selected card was not found.'];
                continue;
            }

            $selected[] = [$row, $card];
        }

        if ([] !== $errors) {
            return $this->json(['detail' => 'Some failed rows could not be resolved.', 'errors' => $errors], 422);
        }

        if ([] === $selected) {
            return $this->json(['detail' => 'No resolved failed rows were selected.'], 422);
        }

        $written = [];
        foreach ($selected as [$row, $card]) {
            $written[] = [$row, $this->importRowIntoInventory($job, $store, $row, $card)];
        }

        $this->entityManager->flush();
        foreach ($written as [$row, $item]) {
            if (null !== $item->getId()) {
                $row->setImportedItemId($item->getId());
            }
        }
        $this->syncJobCounters($job);
        $this->entityManager->flush();

        $this->importLogger->log($job, 'batch_manually_resolved', ['rows' => count($written)]);

        return $this->json($this->serializeJob($job, $request));
    }

    #[Route('/{id}/rows/{rowIndex}/manual-import', name: 'api_store_csv_import_manual_import_row', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function manualImportRow(Request $request, string $slug, int $id, int $rowIndex): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        $row = $this->rowRepository->findOneBy(['job' => $job, 'rowIndex' => $rowIndex]);
        if (!$row instanceof CsvImportRow) {
            return $this->json(['detail' => 'Import row not found.'], 404);
        }

        if (CsvImportRow::STATUS_ERROR !== $row->getStatus()) {
            return $this->json(['detail' => 'Only failed rows can be manually imported.'], 409);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be JSON.'], 400);
        }

        $cardId = (string) ($payload['cardId'] ?? '');
        try {
            $card = '' !== $cardId ? $this->cardRepository->find(Uuid::fromString($cardId)) : null;
        } catch (\InvalidArgumentException) {
            return $this->json(['detail' => 'Card id is invalid.'], 422);
        }

        if (null === $card) {
            return $this->json(['detail' => 'Selected card was not found.'], 404);
        }

        // A row can only be recovered onto a card from the job's own game —
        // whatever the client sends. This is the hard stop that keeps a
        // Pokemon row from ever landing on a Magic card again.
        $jobGameCode = $job->resolvedGameCode();
        if ($card->resolvedGameCode() !== $jobGameCode) {
            return $this->json(['detail' => sprintf(
                'That card is not from this import\'s game — pick a card from the %s catalog.',
                $job->getGame()?->getName() ?? $jobGameCode,
            )], 422);
        }

        $store = $job->getStore();
        if (null === $store) {
            return $this->json(['detail' => 'Store not found for this import job.'], 409);
        }

        $item = $this->importRowIntoInventory($job, $store, $row, $card, [
            'condition' => $payload['condition'] ?? null,
            'quantity' => $payload['quantity'] ?? null,
            'finish' => $payload['finish'] ?? null,
            'isFoil' => $payload['isFoil'] ?? null,
        ]);

        $this->entityManager->flush();
        if (null !== $item->getId()) {
            $row->setImportedItemId($item->getId());
        }
        $this->syncJobCounters($job);
        $this->entityManager->flush();

        $this->importLogger->log($job, 'row_manually_resolved', [
            'rowIndex' => $rowIndex,
            'name' => $row->getName(),
            'cardId' => (string) $card->getId(),
        ]);

        return $this->json($this->serializeJob($job, $request));
    }

    #[Route('/{id}/cancel', name: 'api_store_csv_import_cancel', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function cancel(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (!in_array($job->getStatus(), [CsvImportJob::STATUS_COMPLETED, CsvImportJob::STATUS_FAILED, CsvImportJob::STATUS_CANCELLED], true)) {
            $job->setStatus(CsvImportJob::STATUS_CANCELLED);
            $job->setFinishedAt(new \DateTimeImmutable());
            $this->entityManager->flush();
        }

        return $this->json($this->serializeJobSummary($job));
    }

    /**
     * A job is genuinely processing when its status is PROCESSING and it still has
     * rows in the `processing` state (a handler is actively working the batch). In
     * that case requeue/resume/retry must be rejected with a 409 to avoid double work.
     */
    private function isActivelyProcessing(CsvImportJob $job): bool
    {
        if (CsvImportJob::STATUS_PROCESSING !== $job->getStatus()) {
            return false;
        }

        return $this->rowRepository->countByStatus($job)['processing'] > 0;
    }

    private function looksLikeCsv(UploadedFile $file): bool
    {
        $extension = strtolower((string) $file->getClientOriginalExtension());
        if ('' !== $extension && 'csv' !== $extension && 'txt' !== $extension) {
            return false;
        }

        // Do not call getMimeType() here: it requires Symfony MIME guessers such
        // as the PHP fileinfo extension, which may be disabled in local/dev
        // runtimes. The parser validates the actual CSV shape after this guard.
        $mime = (string) $file->getClientMimeType();

        return '' === $mime || in_array(strtolower($mime), self::ALLOWED_MIME_TYPES, true);
    }

    private function findManagedJob(string $slug, int $id): ?CsvImportJob
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $this->jobRepository->findOneByStoreAndId($store, $id);
    }

    private function serializeJobSummary(CsvImportJob $job): array
    {
        return [
            'id' => $job->getId(),
            'status' => $job->getStatus(),
            'gameCode' => $job->resolvedGameCode(),
            'importType' => $job->getImportType(),
            'originalFilename' => $job->getOriginalFilename(),
            'totalRows' => $job->getTotalRows(),
            'processedRows' => $job->getProcessedRows(),
            'importedRows' => $job->getImportedRows(),
            'failedRows' => $job->getFailedRows(),
            'errorMessage' => $job->getErrorMessage(),
            'createdAt' => $job->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $job->getUpdatedAt()->format(DATE_ATOM),
            'startedAt' => $job->getStartedAt()?->format(DATE_ATOM),
            'finishedAt' => $job->getFinishedAt()?->format(DATE_ATOM),
        ];
    }

    private function requeueJob(CsvImportJob $job): void
    {
        $this->rowRepository->requeueProcessingRows($job);
        $job->setStatus(CsvImportJob::STATUS_QUEUED);
        $job->setErrorMessage(null);
        $job->setFinishedAt(null);
        $this->entityManager->flush();
        $this->messageBus->dispatch(new ProcessCsvImportMessage((int) $job->getId()));
    }

    private function syncJobCounters(CsvImportJob $job): void
    {
        $counts = $this->rowRepository->countByStatus($job);
        $job->setImportedRows($counts['imported']);
        $job->setFailedRows($counts['error']);
        $job->setProcessedRows($counts['imported'] + $counts['error']);

        if (
            CsvImportJob::STATUS_CANCELLED !== $job->getStatus()
            && 0 === $counts['queued']
            && 0 === $counts['processing']
            && 0 === $counts['error']
        ) {
            $job->setStatus(CsvImportJob::STATUS_COMPLETED);
            $job->setErrorMessage(null);
            $job->setFinishedAt(new \DateTimeImmutable());
        }
    }

    /**
     * The treatment a recovered row should be stocked as.
     *
     * An override names it outright; otherwise the sheet's own answer is
     * used, and the platform's generic "Foil"/"Nonfoil" placeholder is
     * replaced by whatever the printing actually calls that side.
     *
     * @param array{condition?: mixed, quantity?: mixed, finish?: mixed, isFoil?: mixed} $overrides
     */
    private function resolveRowFinish(CsvImportRow $row, Card $card, array $overrides): string
    {
        $requested = isset($overrides['finish']) ? (string) $overrides['finish'] : null;
        if (null === $requested && array_key_exists('isFoil', $overrides) && null !== $overrides['isFoil']) {
            return FinishVocabulary::resolveForCard($card, null, (bool) $overrides['isFoil']);
        }

        $requested ??= FinishVocabulary::isGeneric($row->getFinish()) ? null : $row->getFinish();

        return FinishVocabulary::resolveForCard($card, $requested, $row->isFoil());
    }

    /**
     * @param array{condition?: mixed, quantity?: mixed, finish?: mixed, isFoil?: mixed} $overrides
     */
    private function importRowIntoInventory(
        CsvImportJob $job,
        Store $store,
        CsvImportRow $row,
        Card $card,
        array $overrides = [],
    ): \App\Entity\InventoryItem {
        $condition = CardCondition::tryFrom((string) ($overrides['condition'] ?? $row->getCondition())) ?? CardCondition::NM;
        $quantity = max(0, (int) ($overrides['quantity'] ?? $row->getQuantity()));
        $finish = $this->resolveRowFinish($row, $card, $overrides);
        $notes = implode("\n", array_values(array_filter([
            'Manually recovered from CSV import row #'.($row->getRowIndex() + 1).' in import #'.$job->getId(),
            '' !== $row->getGame() && !CsvImportRow::isMagicGame($row->getGame()) ? 'Game: '.$row->getGame() : '',
            '' !== $row->getVariant() ? 'Variant: '.$row->getVariant() : '',
        ])));

        $item = $this->inventoryWriter->write($store, $card, $quantity, $condition, $finish, $notes, false);

        $row
            ->setStatus(CsvImportRow::STATUS_IMPORTED)
            ->setCard($this->catalogCardResolver->serializeCard($card))
            ->setError(null);

        if (null !== $item->getId()) {
            $row->setImportedItemId($item->getId());
        }

        return $item;
    }

    private function serializeJob(CsvImportJob $job, Request $request): array
    {
        $rowStatus = (string) $request->query->get('rowStatus', '');
        if (!in_array($rowStatus, ['queued', 'processing', 'imported', 'error'], true)) {
            $rowStatus = '';
        }
        $rowLimit = min(250, max(25, $request->query->getInt('rowLimit', 75)));
        $requestedOffset = $request->query->getInt('rowOffset', -1);
        $totalRows = $job->getTotalRows();
        $processedRows = $job->getProcessedRows();
        $rowOffset = max(0, $requestedOffset);
        if ($requestedOffset < 0) {
            $rowOffset = max(0, min($processedRows, $totalRows) - 15);
        }

        $statusCounts = $this->rowRepository->countByStatus($job);
        if ('' !== $rowStatus && $requestedOffset < 0) {
            $rowOffset = 0;
        }
        $rows = $this->rowRepository->findWindow($job, $rowOffset, $rowLimit, '' !== $rowStatus ? $rowStatus : null);

        return [
            'id' => $job->getId(),
            'status' => $job->getStatus(),
            'gameCode' => $job->resolvedGameCode(),
            'importType' => $job->getImportType(),
            'originalFilename' => $job->getOriginalFilename(),
            'storagePath' => $job->getStoragePath(),
            'totalRows' => $job->getTotalRows(),
            'processedRows' => $job->getProcessedRows(),
            'importedRows' => $job->getImportedRows(),
            'failedRows' => $job->getFailedRows(),
            'queuedRows' => $statusCounts['queued'],
            'processingRows' => $statusCounts['processing'],
            'errorMessage' => $job->getErrorMessage(),
            'createdAt' => $job->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $job->getUpdatedAt()->format(DATE_ATOM),
            'startedAt' => $job->getStartedAt()?->format(DATE_ATOM),
            'finishedAt' => $job->getFinishedAt()?->format(DATE_ATOM),
            'rowOffset' => $rowOffset,
            'rowLimit' => $rowLimit,
            'rows' => array_map($this->serializeRow(...), $rows),
        ];
    }

    /** @param array<string, mixed> $rowData */
    /**
     * Resolves the target game from the request (form field or query),
     * defaulting to Magic so existing single-game clients keep working.
     */
    private function resolveGame(Request $request): ?Game
    {
        $code = trim((string) ($request->request->get('game') ?? $request->query->get('game') ?? ''));

        return $this->gameRepository->findOneByCode('' !== $code ? $code : Game::CODE_MTG);
    }

    private function resolveImportType(Request $request): string
    {
        $type = trim((string) ($request->request->get('type') ?? $request->query->get('type') ?? ''));

        return in_array($type, CsvImportJob::TYPES, true) ? $type : CsvImportJob::TYPE_CARDS;
    }

    private function createImportRow(CsvImportJob $job, array $rowData): CsvImportRow
    {
        return (new CsvImportRow())
            ->setJob($job)
            ->setRowIndex((int) ($rowData['rowIndex'] ?? 0))
            ->setName($this->truncate((string) ($rowData['name'] ?? ''), 255))
            ->setGame($this->truncate((string) ($rowData['game'] ?? ''), 80))
            ->setSetCode($this->truncate((string) ($rowData['set'] ?? ''), 120))
            ->setCondition($this->truncate((string) ($rowData['condition'] ?? 'NM'), 16))
            ->setFinish((string) ($rowData['finish'] ?? FinishVocabulary::DEFAULT_PLAIN))
            ->setRarity($this->truncate((string) ($rowData['rarity'] ?? ''), 80))
            ->setQuantity((int) ($rowData['quantity'] ?? 0))
            ->setVariant($this->truncate((string) ($rowData['variant'] ?? ''), 255))
            ->setCollectorNumber($this->truncate((string) ($rowData['collectorNumber'] ?? ''), 80))
            ->setPriceCents(isset($rowData['priceCents']) ? (int) $rowData['priceCents'] : null)
            ->setStatus((string) ($rowData['status'] ?? CsvImportRow::STATUS_QUEUED))
            ->setCard(isset($rowData['card']) && is_array($rowData['card']) ? $rowData['card'] : null)
            ->setError(isset($rowData['error']) ? (string) $rowData['error'] : null)
            ->setImportedItemId(isset($rowData['importedItemId']) ? (int) $rowData['importedItemId'] : null);
    }

    private function truncate(string $value, int $maxLength): string
    {
        return strlen($value) > $maxLength ? substr($value, 0, $maxLength) : $value;
    }

    private function collectionMatchKey(string $set, string $collectorNumber): string
    {
        // Delegate to the canonical key builder so this can never drift from
        // the format ScryfallClient::fetchCollectionBySetCollectors() keys by.
        return \App\Service\Scryfall\ScryfallClient::collectionKey($set, $collectorNumber);
    }

    /** @return array<string, mixed> */
    private function serializeRow(CsvImportRow $row): array
    {
        return [
            'rowIndex' => $row->getRowIndex(),
            'name' => $row->getName(),
            'game' => $row->getGame(),
            'set' => $row->getSetCode(),
            'condition' => $row->getCondition(),
            'finish' => $row->getFinish(),
            'isFoil' => $row->isFoil(),
            'rarity' => $row->getRarity(),
            'quantity' => $row->getQuantity(),
            'variant' => $row->getVariant(),
            'collectorNumber' => $row->getCollectorNumber(),
            'status' => $row->getStatus(),
            'card' => $row->getCard(),
            'error' => $row->getError(),
            'importedItemId' => $row->getImportedItemId(),
        ];
    }
}
