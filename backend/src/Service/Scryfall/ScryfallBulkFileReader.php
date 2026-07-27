<?php

namespace App\Service\Scryfall;

use JsonMachine\Items;
use JsonMachine\JsonDecoder\ExtJsonDecoder;

/**
 * Streams card payloads out of a downloaded Scryfall bulk file, one card at
 * a time, without ever materialising the whole dataset.
 *
 * Scryfall is migrating bulk data from a single JSON array to gzipped JSONL
 * (one card object per line); the legacy array format stopped being offered
 * on 2026-07-20. This reader accepts every combination it may still meet in
 * the wild — plain or gzipped, JSONL or legacy array — by sniffing the file
 * itself (gzip magic bytes, then the first structural character) instead of
 * trusting names or content types.
 */
final class ScryfallBulkFileReader
{
    /**
     * @return \Generator<int, array<string, mixed>>
     */
    public function cards(string $path): \Generator
    {
        $gzipped = $this->isGzipped($path);

        $stream = $this->open($path, $gzipped);
        try {
            $first = $this->firstStructuralChar($stream);

            if ('[' === $first) {
                yield from $this->readJsonArray($path, $gzipped, $stream);

                return;
            }

            if ('{' === $first) {
                yield from $this->readJsonLines($stream);

                return;
            }

            throw new \RuntimeException(sprintf('Unrecognized Scryfall bulk format: expected "[" (JSON array) or "{" (JSONL), found %s.', null === $first ? 'an empty file' : sprintf('"%s"', $first)));
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    private function isGzipped(string $path): bool
    {
        $handle = fopen($path, 'rb');
        if (false === $handle) {
            throw new \RuntimeException(sprintf('Unable to open Scryfall bulk file "%s".', $path));
        }

        try {
            $magic = fread($handle, 2);
        } finally {
            fclose($handle);
        }

        return "\x1f\x8b" === $magic;
    }

    /** @return resource */
    private function open(string $path, bool $gzipped)
    {
        $target = $gzipped ? 'compress.zlib://'.$path : $path;
        $stream = @fopen($target, 'rb');
        if (false === $stream) {
            throw new \RuntimeException(sprintf('Unable to open Scryfall bulk file "%s".', $path));
        }

        return $stream;
    }

    /**
     * Peeks past leading whitespace to the first structural character. The
     * stream is left positioned after that character, which is fine for both
     * consumers: the JSONL path re-reads from a fresh stream, and the array
     * path hands JsonMachine its own fresh stream too (compress.zlib streams
     * don't support rewinding reliably).
     *
     * @param resource $stream
     */
    private function firstStructuralChar($stream): ?string
    {
        while (false !== ($char = fgetc($stream))) {
            if (!ctype_space($char)) {
                return $char;
            }
        }

        return null;
    }

    /**
     * Legacy format: one top-level JSON array. JsonMachine iterates it one
     * element at a time so only the current card is ever decoded in memory.
     *
     * @param resource $sniffed the already-open stream from format detection (closed here)
     *
     * @return \Generator<int, array<string, mixed>>
     */
    private function readJsonArray(string $path, bool $gzipped, $sniffed): \Generator
    {
        fclose($sniffed);

        $stream = $this->open($path, $gzipped);
        try {
            $cards = Items::fromStream($stream, ['decoder' => new ExtJsonDecoder(true)]);
            foreach ($cards as $cardData) {
                if (is_array($cardData)) {
                    yield $cardData;
                }
            }
        } finally {
            fclose($stream);
        }
    }

    /**
     * JSONL: one card object per line. A line that fails to decode means a
     * truncated or corrupt download — fail loudly rather than silently sync
     * a partial catalog.
     *
     * @param resource $stream positioned just past the first "{" by format detection
     *
     * @return \Generator<int, array<string, mixed>>
     */
    private function readJsonLines($stream): \Generator
    {
        // Format detection consumed the opening "{"; put it back in front of
        // the remainder of that first line.
        $carry = '{';
        $lineNumber = 1;

        while (false !== ($chunk = fgets($stream))) {
            $line = trim($carry.$chunk);
            $carry = '';

            if ('' === $line) {
                ++$lineNumber;
                continue;
            }

            try {
                $decoded = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException $e) {
                throw new \RuntimeException(sprintf('Invalid JSON on line %d of the Scryfall bulk file: %s', $lineNumber, $e->getMessage()), 0, $e);
            }

            if (!is_array($decoded)) {
                throw new \RuntimeException(sprintf('Line %d of the Scryfall bulk file is not a JSON object.', $lineNumber));
            }

            yield $decoded;
            ++$lineNumber;
        }
    }
}
