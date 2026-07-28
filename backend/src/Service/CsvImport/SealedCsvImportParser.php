<?php

namespace App\Service\CsvImport;

/**
 * Parses a sealed-product inventory sheet. Sealed sheets are much simpler
 * than singles: no condition, foil, or collector number — a product name,
 * how many you have, and optionally what you sell it for.
 *
 * Recognized columns (case-insensitive, aliases accepted):
 *   name       (required) product name, e.g. "Modern Horizons 3 Play Booster Box"
 *   quantity   (required) copies on hand
 *   price      (optional) your sell price; blank falls back to market
 *   productId  (optional) TCGplayer product id — an exact-match shortcut
 *   set        (optional) set/group name, used to disambiguate names
 */
final class SealedCsvImportParser
{
    /** Hard cap on data rows for a single sealed import. */
    public const MAX_ROWS = 20000;

    private const REQUIRED_HEADERS = ['name', 'quantity'];

    /** @var array<string, string> */
    private const HEADER_ALIASES = [
        'name' => 'name',
        'productname' => 'name',
        'product' => 'name',
        'title' => 'name',
        'item' => 'name',
        'quantity' => 'quantity',
        'qty' => 'quantity',
        'count' => 'quantity',
        'totalquantity' => 'quantity',
        'onhand' => 'quantity',
        'price' => 'price',
        'sellprice' => 'price',
        'listprice' => 'price',
        'marketprice' => 'price',
        'productid' => 'productId',
        'tcgproductid' => 'productId',
        'tcgplayerid' => 'productId',
        'tcgplayerproductid' => 'productId',
        'set' => 'set',
        'setname' => 'set',
        'group' => 'set',
        'expansion' => 'set',
    ];

    public function __construct(
        private readonly CsvGrid $grid,
    ) {
    }

    /** @return array{rows: list<array<string, mixed>>, warnings: list<string>} */
    public function parse(string $content): array
    {
        $grid = $this->grid->toRows($content, self::MAX_ROWS);
        if (count($grid) < 2) {
            throw new \InvalidArgumentException('CSV must have a header row and at least one data row.');
        }

        $headers = array_map(
            static fn (string $header): string => trim(preg_replace('/^\x{FEFF}/u', '', $header) ?? ''),
            $grid[0],
        );

        $index = [];
        foreach ($headers as $i => $header) {
            $canonical = self::HEADER_ALIASES[strtolower(preg_replace('/[^a-z0-9]/i', '', $header) ?? '')] ?? null;
            if (null !== $canonical && !array_key_exists($canonical, $index)) {
                $index[$canonical] = $i;
            }
        }

        $missing = array_values(array_filter(
            self::REQUIRED_HEADERS,
            static fn (string $header): bool => !array_key_exists($header, $index),
        ));
        if ([] !== $missing) {
            throw new \InvalidArgumentException(sprintf(
                'Missing required column(s): %s. Detected headers: %s. Sealed sheets need a product name and a quantity; price, productId, and set are optional.',
                implode(', ', $missing),
                implode(', ', $headers) ?: 'none',
            ));
        }

        $dataRows = array_slice($grid, 1);
        if (count($dataRows) > self::MAX_ROWS) {
            throw new \InvalidArgumentException(sprintf(
                'CSV has too many rows (%d). The maximum supported is %d.',
                count($dataRows),
                self::MAX_ROWS,
            ));
        }

        $rows = [];
        foreach ($dataRows as $rowIndex => $cols) {
            $quantityValue = trim((string) ($cols[$index['quantity']] ?? '0'));
            $quantity = is_numeric($quantityValue) ? (int) $quantityValue : 0;

            $row = [
                'rowIndex' => $rowIndex,
                'name' => trim((string) ($cols[$index['name']] ?? '')),
                'set' => isset($index['set']) ? trim((string) ($cols[$index['set']] ?? '')) : '',
                'quantity' => $quantity,
                'priceCents' => isset($index['price'])
                    ? $this->parsePriceCents((string) ($cols[$index['price']] ?? ''))
                    : null,
                // The TCGplayer product id rides in collectorNumber so sealed
                // rows reuse the shared CsvImportRow storage without a
                // sealed-only column.
                'collectorNumber' => isset($index['productId'])
                    ? trim((string) ($cols[$index['productId']] ?? ''))
                    : '',
                'status' => 'queued',
                'card' => null,
                'error' => null,
            ];

            if ('' === $row['name']) {
                $row['status'] = 'error';
                $row['error'] = 'Product name is required.';
            } elseif (!is_numeric($quantityValue) || $quantity < 0) {
                $row['status'] = 'error';
                $row['error'] = 'Quantity must be zero or greater.';
            }

            $rows[] = $row;
        }

        return ['rows' => $rows, 'warnings' => []];
    }

    private function parsePriceCents(string $value): ?int
    {
        $clean = trim(str_replace(['$', ',', ' '], '', $value));
        if ('' === $clean || !is_numeric($clean)) {
            return null;
        }

        $cents = (int) round(((float) $clean) * 100);

        return $cents > 0 ? $cents : null;
    }
}
