<?php

namespace App\Controller;

use App\Repository\StoreRepository;
use App\Service\Order\OrderHistoryCsvImporter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/orders')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class AdminOrderHistoryController extends AbstractController
{
    private const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

    /** @var list<string> */
    private const ALLOWED_MIME_TYPES = [
        'text/csv',
        'text/plain',
        'text/x-csv',
        'text/comma-separated-values',
        'application/csv',
        'application/x-csv',
        'application/excel',
        'application/vnd.ms-excel',
        'application/octet-stream',
    ];

    /** @var list<string> */
    private const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls', 'xlsm', 'ods'];

    public function __construct(
        private readonly StoreRepository $stores,
        private readonly OrderHistoryCsvImporter $importer,
    ) {
    }

    /**
     * Import historical customer orders from a previous-site CSV into one store.
     * Matching platform users (by email) see the orders in their history.
     */
    #[Route('/import-history', name: 'api_admin_orders_import_history', methods: ['POST'], priority: 10)]
    public function importHistory(Request $request): JsonResponse
    {
        $slug = trim((string) $request->request->get('storeSlug', ''));
        if ('' === $slug) {
            return $this->json(['error' => 'Choose a destination store.'], Response::HTTP_BAD_REQUEST);
        }
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['error' => 'A CSV file is required.'], Response::HTTP_BAD_REQUEST);
        }
        if (!$file->isValid()) {
            return $this->json(['error' => 'The uploaded file is invalid or incomplete.'], Response::HTTP_BAD_REQUEST);
        }

        $size = $file->getSize();
        if (null === $size || $size > self::MAX_UPLOAD_BYTES) {
            return $this->json(
                ['error' => sprintf('CSV exceeds the maximum allowed size of %d MB.', self::MAX_UPLOAD_BYTES >> 20)],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }
        $extension = strtolower((string) $file->getClientOriginalExtension());
        if (in_array($extension, self::SPREADSHEET_EXTENSIONS, true)) {
            return $this->json(
                ['error' => 'Excel workbooks are not accepted. Export the sheet as CSV and try again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }
        if (!$this->looksLikeCsv($file)) {
            return $this->json(['error' => 'Only CSV files are accepted.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $result = $this->importer->import(
                $store,
                $file->getContent(),
                $request->request->getBoolean('dryRun'),
            );
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json($result);
    }

    /**
     * Attach catalog cards to already-imported order lines that only have names,
     * so customer order history can show card art.
     */
    #[Route('/relink-cards', name: 'api_admin_orders_relink_cards', methods: ['POST'], priority: 10)]
    public function relinkCards(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        $slug = trim((string) (
            \is_array($payload)
                ? ($payload['storeSlug'] ?? '')
                : $request->request->get('storeSlug', '')
        ));
        if ('' === $slug) {
            return $this->json(['error' => 'Choose a destination store.'], Response::HTTP_BAD_REQUEST);
        }
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        $result = $this->importer->relinkMissingCards($store);

        return $this->json([
            'storeSlug' => $slug,
            'examined' => $result['examined'],
            'linked' => $result['linked'],
            'unmatched' => $result['unmatched'],
            'samples' => $result['samples'],
        ]);
    }

    private function looksLikeCsv(UploadedFile $file): bool
    {
        $mime = strtolower((string) ($file->getMimeType() ?: $file->getClientMimeType()));
        if (in_array($mime, self::ALLOWED_MIME_TYPES, true)) {
            return true;
        }

        return 'csv' === strtolower((string) $file->getClientOriginalExtension());
    }
}
