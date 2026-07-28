<?php

namespace App\Service\CsvImport;

use App\Entity\CsvImportJob;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\SealedProductRepository;

/**
 * Dry-run validation for the import wizard: parses a sheet and resolves a
 * bounded sample of its rows against the catalog WITHOUT persisting
 * anything, so staff see what will happen before committing an import.
 *
 * Resolution here is deliberately local-only (no Scryfall round-trips) —
 * a preview must be fast and free of side effects; the real import still
 * falls back to remote lookups for Magic rows it can't place locally.
 */
final readonly class ImportPreviewer
{
    /** How many rows are resolved and returned in the preview sample. */
    public const SAMPLE_SIZE = 25;

    public function __construct(
        private CsvImportParser $cardParser,
        private SealedCsvImportParser $sealedParser,
        private CardRepository $cardRepository,
        private SealedProductRepository $sealedProducts,
    ) {
    }

    /**
     * @return array{
     *     importType: string,
     *     gameCode: string,
     *     totalRows: int,
     *     invalidRows: int,
     *     matchedRows: int,
     *     unmatchedRows: int,
     *     sampleSize: int,
     *     totalQuantity: int,
     *     sample: list<array<string, mixed>>,
     *     warnings: list<string>
     * }
     */
    public function preview(string $content, Game $game, string $importType): array
    {
        $sealed = CsvImportJob::TYPE_SEALED === $importType;
        $parsed = $sealed ? $this->sealedParser->parse($content) : $this->cardParser->parse($content);
        $rows = $parsed['rows'];

        $invalid = 0;
        $totalQuantity = 0;
        foreach ($rows as $row) {
            if ('error' === ($row['status'] ?? '')) {
                ++$invalid;
            }
            $totalQuantity += max(0, (int) ($row['quantity'] ?? 0));
        }

        $sample = [];
        $matched = 0;
        foreach (array_slice($rows, 0, self::SAMPLE_SIZE) as $row) {
            $entry = $sealed ? $this->previewSealedRow($row, $game) : $this->previewCardRow($row, $game);
            if ('matched' === $entry['match']) {
                ++$matched;
            }
            $sample[] = $entry;
        }

        return [
            'importType' => $sealed ? CsvImportJob::TYPE_SEALED : CsvImportJob::TYPE_CARDS,
            'gameCode' => $game->getCode(),
            'totalRows' => count($rows),
            'invalidRows' => $invalid,
            'matchedRows' => $matched,
            'unmatchedRows' => count($sample) - $matched,
            'sampleSize' => count($sample),
            'totalQuantity' => $totalQuantity,
            'sample' => $sample,
            'warnings' => $parsed['warnings'],
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function previewCardRow(array $row, Game $game): array
    {
        $name = (string) ($row['name'] ?? '');
        $setCode = (string) ($row['set'] ?? '');
        $collectorNumber = (string) ($row['collectorNumber'] ?? '');

        $card = null;
        if ('' !== trim($name)) {
            if ($game->isMtg()) {
                // Magic: the natural key is the exact-match path; the import
                // itself falls back to Scryfall for anything missed here.
                $candidates = '' !== trim($setCode) && '' !== trim($collectorNumber)
                    ? $this->cardRepository->findByNaturalKey($setCode, $collectorNumber, 1)
                    : [];
                $card = $candidates[0] ?? $this->cardRepository->findOneByExactName($name);
            } else {
                $card = $this->cardRepository->findOneForGame($game, $name, $setCode, $collectorNumber);
            }
        }

        return [
            'rowIndex' => (int) ($row['rowIndex'] ?? 0),
            'name' => $name,
            'set' => $setCode,
            'collectorNumber' => $collectorNumber,
            'quantity' => (int) ($row['quantity'] ?? 0),
            'condition' => (string) ($row['condition'] ?? 'NM'),
            'isFoil' => (bool) ($row['isFoil'] ?? false),
            'match' => $this->matchState($row, null !== $card),
            'matchedName' => $card?->getName(),
            'matchedSet' => $card?->getSetName() ?? $card?->getSetCode(),
            'imageUrl' => $card?->getImageUris()['small'] ?? $card?->getImageUris()['normal'] ?? null,
            'error' => $row['error'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function previewSealedRow(array $row, Game $game): array
    {
        $name = (string) ($row['name'] ?? '');
        $productIdText = trim((string) ($row['collectorNumber'] ?? ''));
        $setName = (string) ($row['set'] ?? '');

        $product = '' !== trim($name)
            ? $this->sealedProducts->findOneForImport(
                $game,
                $name,
                is_numeric($productIdText) ? (int) $productIdText : null,
                $setName,
            )
            : null;

        return [
            'rowIndex' => (int) ($row['rowIndex'] ?? 0),
            'name' => $name,
            'set' => $setName,
            'quantity' => (int) ($row['quantity'] ?? 0),
            'priceCents' => $row['priceCents'] ?? null,
            'match' => $this->matchState($row, null !== $product),
            'matchedName' => $product?->getName(),
            'matchedSet' => $product?->getGameSet()?->getName(),
            'imageUrl' => $product?->getImageUrl(),
            'marketPriceCents' => $product?->getMarketPriceCents(),
            'error' => $row['error'] ?? null,
        ];
    }

    /** @param array<string, mixed> $row */
    private function matchState(array $row, bool $resolved): string
    {
        if ('error' === ($row['status'] ?? '')) {
            return 'invalid';
        }

        return $resolved ? 'matched' : 'unmatched';
    }
}
