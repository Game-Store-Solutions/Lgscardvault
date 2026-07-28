<?php

namespace App\Service\CsvImport;

/**
 * Turns raw CSV text into a bounded grid of rows, auto-detecting the field
 * delimiter. Shared by every import parser (singles, sealed) so delimiter
 * sniffing and row limits behave identically no matter what is imported.
 */
final class CsvGrid
{
    /**
     * Parses one physical line at a time via fgetcsv, keeping at most
     * $maxDataRows + 1 data rows so the caller can detect an overflow and
     * reject the file instead of building an unbounded grid in memory.
     *
     * @return list<list<string>> header row first
     */
    public function toRows(string $text, int $maxDataRows): array
    {
        $delimiter = $this->detectDelimiter($text);

        $stream = fopen('php://temp', 'r+');
        if (false === $stream) {
            throw new \RuntimeException('Could not open a temporary stream to parse the CSV.');
        }

        try {
            fwrite($stream, $text);
            rewind($stream);

            $rows = [];
            $dataRowCount = 0;
            // header + maxDataRows + 1 sentinel row so the caller sees the overflow.
            $maxRowsToKeep = $maxDataRows + 2;

            while (false !== ($cols = fgetcsv($stream, 0, $delimiter, '"', '\\'))) {
                // fgetcsv yields [null] for a blank line; skip fully empty rows.
                if ([null] === $cols) {
                    continue;
                }

                $cols = array_map(static fn ($cell): string => (string) ($cell ?? ''), $cols);
                if ([] === array_filter($cols, static fn (string $cell): bool => '' !== trim($cell))) {
                    continue;
                }

                $rows[] = $cols;

                // First non-empty row is the header; subsequent rows are data.
                if (count($rows) > 1) {
                    ++$dataRowCount;
                    if ($dataRowCount >= $maxRowsToKeep) {
                        break;
                    }
                }
            }

            return $rows;
        } finally {
            fclose($stream);
        }
    }

    /**
     * Detects the field delimiter by sampling the first several non-empty lines and
     * counting how many fields each candidate yields per line (via str_getcsv, so
     * quoted delimiters are not counted). The candidate with the most consistent,
     * highest field count wins.
     */
    private function detectDelimiter(string $text): string
    {
        $candidates = [',', "\t", ';', '|'];
        $sampleLines = [];
        foreach (preg_split('/\r\n|\r|\n/', $text) ?: [] as $line) {
            if ('' === trim($line)) {
                continue;
            }
            $sampleLines[] = $line;
            if (count($sampleLines) >= 10) {
                break;
            }
        }

        if ([] === $sampleLines) {
            return ',';
        }

        $bestDelimiter = ',';
        $bestScore = 0;

        foreach ($candidates as $delimiter) {
            $score = 0;
            foreach ($sampleLines as $line) {
                $count = count(str_getcsv($line, $delimiter, '"', '\\'));
                if ($count > 1) {
                    $score += $count;
                }
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestDelimiter = $delimiter;
            }
        }

        return $bestDelimiter;
    }
}
