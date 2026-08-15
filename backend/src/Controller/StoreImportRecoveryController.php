<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\CsvImportJobRepository;
use App\Repository\CsvImportRowRepository;
use App\Repository\GameRepository;
use App\Repository\StoreRepository;
use App\Security\ApiRateLimit;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\StockablePrintingPolicy;
use App\Service\CsvImport\ImportRowSerializer;
use App\Service\Recovery\CardReferenceResolver;
use App\Service\Recovery\RecoveryCardFinder;
use App\Service\Recovery\RecoveryErrorClassifier;
use App\Service\Recovery\RecoveryQuery;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Failed-row recovery, deliberately isolated from the shared catalog search.
 *
 * Everything here is scoped to one store and one import job, so it inherits
 * tenant authorisation, gets its own rate-limit budget, and cannot change how
 * /api/catalog/search behaves for the seven other screens that depend on it.
 *
 * Writes still go through StoreCsvImportController's manual-import endpoints,
 * which already enforce StockablePrintingPolicy — this controller only reads
 * the catalog and marks rows as skipped.
 */
#[Route('/api/stores/{slug}/csv-imports/{id}/recovery')]
final class StoreImportRecoveryController extends AbstractController
{
    /** Recovery searches are interactive; keep the response snappy. */
    private const MAX_RESULTS = 40;

    /** Same bound as failed-row preview — a 50k fail list cannot dump every row. */
    private const QUEUE_ERROR_LIMIT = 300;

    /** Skipped rows stay restorable without crowding out outstanding work. */
    private const QUEUE_SKIPPED_LIMIT = 100;

    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly CsvImportJobRepository $jobRepository,
        private readonly CsvImportRowRepository $rowRepository,
        private readonly CardRepository $cardRepository,
        private readonly GameRepository $gameRepository,
        private readonly RecoveryCardFinder $finder,
        private readonly CardReferenceResolver $referenceResolver,
        private readonly RecoveryErrorClassifier $errorClassifier,
        private readonly CatalogCardResolver $catalogCardResolver,
        private readonly StockablePrintingPolicy $stockablePrintingPolicy,
        private readonly ImportRowSerializer $rowSerializer,
        private readonly EntityManagerInterface $entityManager,
        private readonly \App\Service\Import\ImportLogger $importLogger,
        #[Autowire(service: 'limiter.import_recovery')]
        private readonly RateLimiterFactoryInterface $recoveryLimiter,
    ) {
    }

    /**
     * The work queue: every unresolved row, plus the error buckets that let
     * the operator attack one class of failure at a time.
     */
    #[Route('/queue', name: 'api_store_import_recovery_queue', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function queue(string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        $errorSummaries = $this->rowRepository->findErrorSummaries($job);
        $groups = [];
        foreach ($errorSummaries as $summary) {
            $reason = $this->errorClassifier->classify($summary['error']);
            $groups[$reason] ??= ['reason' => $reason, 'count' => 0, 'rowIndexes' => []];
            ++$groups[$reason]['count'];
        }

        $errorRows = $this->rowRepository->findByStatuses(
            $job,
            [CsvImportRow::STATUS_ERROR],
            self::QUEUE_ERROR_LIMIT,
        );
        foreach ($errorRows as $row) {
            $reason = $this->errorClassifier->classify($row->getError());
            $groups[$reason] ??= ['reason' => $reason, 'count' => 0, 'rowIndexes' => []];
            $groups[$reason]['rowIndexes'][] = $row->getRowIndex();
        }

        usort($groups, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);
        $skippedRows = $this->rowRepository->findByStatuses(
            $job,
            [CsvImportRow::STATUS_SKIPPED],
            self::QUEUE_SKIPPED_LIMIT,
        );
        $rows = array_merge($errorRows, $skippedRows);
        $counts = $this->rowRepository->countByStatus($job);

        return $this->json([
            'gameCode' => $job->resolvedGameCode(),
            'counts' => $counts,
            'truncated' => $counts['error'] > count($errorRows),
            'groups' => array_values($groups),
            'rows' => array_map($this->rowSerializer->serialize(...), $rows),
        ]);
    }

    /**
     * The recovery search ladder. Unlike /api/catalog/search this reports what
     * it had to relax, and returns online-only printings as rejected-with-
     * reason instead of hiding them behind an empty result.
     */
    #[Route('/search', name: 'api_store_import_recovery_search', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function search(Request $request, string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (null !== $response = ApiRateLimit::enforce($this->recoveryLimiter, $this->rateLimitKey($request))) {
            return $response;
        }

        $game = $this->gameRepository->findOneByCode($job->resolvedGameCode() ?: Game::CODE_MTG);
        if (!$game instanceof Game) {
            return $this->json(['detail' => 'Unknown game for this import.'], 404);
        }

        $finish = strtolower(trim((string) $request->query->get('finish', '')));
        if (!in_array($finish, ['foil', 'nonfoil'], true)) {
            $finish = '';
        }

        $query = new RecoveryQuery(
            $game,
            trim((string) $request->query->get('q', '')),
            strtolower($this->catalogCardResolver->normalizeSetCode((string) $request->query->get('set', ''))),
            strtolower(trim((string) $request->query->get('collectorNumber', ''))),
            strtolower(trim((string) $request->query->get('rarity', ''))),
            $finish,
        );

        $result = $this->finder->find($query);

        return $this->json([
            'items' => array_map(
                $this->catalogCardResolver->serializeCard(...),
                array_slice($result->items, 0, self::MAX_RESULTS),
            ),
            'rejected' => array_map(
                fn (array $entry): array => [
                    'card' => $this->catalogCardResolver->serializeCard($entry['card']),
                    'reason' => $entry['reason'],
                ],
                array_slice($result->rejected, 0, self::MAX_RESULTS),
            ),
            'relaxed' => $result->relaxed,
        ]);
    }

    /**
     * The escape hatch: paste a Scryfall URL, a card id, or "mh3/20" and get
     * that exact printing.
     */
    #[Route('/reference', name: 'api_store_import_recovery_reference', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function reference(Request $request, string $slug, int $id): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (null !== $response = ApiRateLimit::enforce($this->recoveryLimiter, $this->rateLimitKey($request))) {
            return $response;
        }

        $reference = trim((string) $request->query->get('ref', ''));
        if ('' === $reference) {
            return $this->json(['detail' => 'Paste a Scryfall link, card id, or set/collector.'], 400);
        }

        $card = $this->referenceResolver->resolve($reference);
        if (!$card instanceof Card) {
            return $this->json([
                'detail' => 'That does not look like a Scryfall link, card id, or set/collector pair.',
            ], 422);
        }

        if ($card->resolvedGameCode() !== $job->resolvedGameCode()) {
            return $this->json([
                'detail' => sprintf(
                    'That card is not from this import\'s game — pick a card from the %s catalog.',
                    $job->getGame()?->getName() ?? $job->resolvedGameCode(),
                ),
            ], 422);
        }

        $onlineOnly = $this->stockablePrintingPolicy->storedRejectionReason($card, false);
        $onlineOnlyFoil = $this->stockablePrintingPolicy->storedRejectionReason($card, true);
        if (null !== $onlineOnly && null !== $onlineOnlyFoil) {
            return $this->json(['detail' => $onlineOnly], 422);
        }

        return $this->json(['card' => $this->catalogCardResolver->serializeCard($card)]);
    }

    /** Every other paper printing of a matched card, newest first. */
    #[Route('/printings/{cardId}', name: 'api_store_import_recovery_printings', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function printings(Request $request, string $slug, int $id, string $cardId): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        if (null !== $response = ApiRateLimit::enforce($this->recoveryLimiter, $this->rateLimitKey($request))) {
            return $response;
        }

        try {
            $card = $this->cardRepository->find(Uuid::fromString($cardId));
        } catch (\InvalidArgumentException) {
            return $this->json(['detail' => 'Card id is invalid.'], 422);
        }

        if (!$card instanceof Card) {
            return $this->json(['detail' => 'Card not found.'], 404);
        }

        return $this->json([
            'items' => array_map(
                $this->catalogCardResolver->serializeCard(...),
                $this->finder->paperPrintingsOf($card),
            ),
        ]);
    }

    /**
     * Set a row aside so the queue can empty.
     *
     * Without this a row nobody can fix keeps its import permanently short of
     * completed, and the failed list never shrinks no matter how much work
     * the operator does.
     */
    #[Route('/rows/{rowIndex}/skip', name: 'api_store_import_recovery_skip', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function skip(string $slug, int $id, int $rowIndex): JsonResponse
    {
        return $this->setSkipped($slug, $id, $rowIndex, true);
    }

    #[Route('/rows/{rowIndex}/unskip', name: 'api_store_import_recovery_unskip', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function unskip(string $slug, int $id, int $rowIndex): JsonResponse
    {
        return $this->setSkipped($slug, $id, $rowIndex, false);
    }

    private function setSkipped(string $slug, int $id, int $rowIndex, bool $skipped): JsonResponse
    {
        $job = $this->findManagedJob($slug, $id);
        if (!$job instanceof CsvImportJob) {
            return $this->json(['detail' => 'Import job not found.'], 404);
        }

        $row = $this->rowRepository->findOneBy(['job' => $job, 'rowIndex' => $rowIndex]);
        if (!$row instanceof CsvImportRow) {
            return $this->json(['detail' => 'Import row not found.'], 404);
        }

        $allowed = $skipped ? CsvImportRow::STATUS_ERROR : CsvImportRow::STATUS_SKIPPED;
        if ($allowed !== $row->getStatus()) {
            return $this->json([
                'detail' => $skipped
                    ? 'Only failed rows can be skipped.'
                    : 'Only skipped rows can be restored.',
            ], 409);
        }

        $row->setStatus($skipped ? CsvImportRow::STATUS_SKIPPED : CsvImportRow::STATUS_ERROR);
        // Flush the row first so the COUNT query in syncJobCounters sees it.
        $this->entityManager->flush();

        $counts = $this->rowRepository->syncJobCounters($job, true);
        $this->entityManager->flush();

        $this->importLogger->log($job, $skipped ? 'row_skipped' : 'row_unskipped', [
            'rowIndex' => $rowIndex,
            'name' => $row->getName(),
        ]);

        return $this->json([
            'row' => $this->rowSerializer->serialize($row),
            'counts' => $counts,
        ]);
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

    private function rateLimitKey(Request $request): string
    {
        $user = $this->getUser();

        return null !== $user ? 'user:'.$user->getUserIdentifier() : 'ip:'.$request->getClientIp();
    }
}
