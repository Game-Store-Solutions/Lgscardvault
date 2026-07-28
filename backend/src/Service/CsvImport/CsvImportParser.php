<?php

namespace App\Service\CsvImport;

final class CsvImportParser
{
    /** Hard cap on data rows we will parse/persist for a single import. */
    public const MAX_ROWS = 50000;

    private const REQUIRED_HEADERS = [
        'name',
        'game',
        'set',
        'condition',
        'foil',
        'rarity',
        'quantity',
        'variant',
        'collectorNumber',
    ];

    /** @var array<string, string> */
    private const HEADER_ALIASES = [
        'name' => 'name',
        'cardname' => 'name',
        'productname' => 'name',
        'title' => 'name',
        'game' => 'game',
        'gamename' => 'game',
        'set' => 'set',
        'setcode' => 'set',
        'setname' => 'set',
        'expansion' => 'set',
        'condition' => 'condition',
        'cardcondition' => 'condition',
        'foil' => 'foil',
        'foiling' => 'foil',
        'finish' => 'foil',
        'printing' => 'foil',
        'rarity' => 'rarity',
        'quantity' => 'quantity',
        'qty' => 'quantity',
        'totalquantity' => 'quantity',
        'count' => 'quantity',
        'variant' => 'variant',
        'version' => 'variant',
        'collectornumber' => 'collectorNumber',
        'collector' => 'collectorNumber',
        'collectorno' => 'collectorNumber',
        'collectornum' => 'collectorNumber',
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

        $headers = array_map(static fn (string $header): string => trim(preg_replace('/^\x{FEFF}/u', '', $header) ?? ''), $grid[0]);
        $index = [];
        foreach ($headers as $i => $header) {
            $canonical = $this->canonicalHeader($header);
            if (null !== $canonical && !array_key_exists($canonical, $index)) {
                $index[$canonical] = $i;
            }
        }

        $missing = array_values(array_filter(self::REQUIRED_HEADERS, static fn (string $header): bool => !array_key_exists($header, $index)));
        if ([] !== $missing) {
            throw new \InvalidArgumentException(
                sprintf(
                    'Missing required column(s): %s. Detected headers: %s. Headers are case-insensitive; "Collector Number" is accepted.',
                    implode(', ', $missing),
                    implode(', ', $headers) ?: 'none',
                ),
            );
        }

        $dataRows = array_slice($grid, 1);
        if (count($dataRows) > self::MAX_ROWS) {
            throw new \InvalidArgumentException(
                sprintf('CSV has too many rows (%d). The maximum supported is %d.', count($dataRows), self::MAX_ROWS),
            );
        }

        $rows = [];
        $warnings = [];
        foreach ($dataRows as $rowIndex => $cols) {
            $variant = trim((string) ($cols[$index['variant']] ?? ''));
            $quantityValue = trim((string) ($cols[$index['quantity']] ?? '0'));
            $quantity = is_numeric($quantityValue) ? (int) $quantityValue : 0;
            $row = [
                'rowIndex' => $rowIndex,
                'name' => trim((string) ($cols[$index['name']] ?? '')),
                'game' => trim((string) ($cols[$index['game']] ?? '')),
                'set' => trim((string) ($cols[$index['set']] ?? '')),
                'condition' => $this->parseCondition((string) ($cols[$index['condition']] ?? 'NM')),
                'isFoil' => $this->parseFoil((string) ($cols[$index['foil']] ?? ''), $variant),
                'rarity' => trim((string) ($cols[$index['rarity']] ?? '')),
                'quantity' => $quantity,
                'variant' => $variant,
                'collectorNumber' => trim((string) ($cols[$index['collectorNumber']] ?? '')),
                'status' => 'queued',
                'card' => null,
                'error' => null,
            ];

            if ('' === $row['name']) {
                $row['status'] = 'error';
                $row['error'] = 'Card name is required.';
            } elseif (!is_numeric($quantityValue) || $quantity < 0) {
                $row['status'] = 'error';
                $row['error'] = 'Quantity must be zero or greater.';
            }

            $rows[] = $row;
        }

        return ['rows' => $rows, 'warnings' => $warnings];
    }

    private function canonicalHeader(string $value): ?string
    {
        $normalized = preg_replace('/[^a-z0-9]/', '', strtolower(trim($value))) ?? '';

        return self::HEADER_ALIASES[$normalized] ?? null;
    }

    private function parseCondition(string $value): string
    {
        $normalized = strtolower(trim($value));
        return match ($normalized) {
            'nm', 'near mint' => 'NM',
            'lp', 'lightly played' => 'LP',
            'mp', 'moderately played' => 'MP',
            'hp', 'heavily played' => 'HP',
            'dmg', 'damaged' => 'DMG',
            default => strtoupper(trim($value)),
        };
    }

    private function parseFoil(string $value, string $variant): bool
    {
        $normalized = strtolower(trim($value.' '.$variant));
        foreach (['1', 'true', 'yes', 'y', 'foil'] as $token) {
            if (in_array($token, preg_split('/\s+/', $normalized) ?: [], true)) {
                return true;
            }
        }

        return false;
    }
}
