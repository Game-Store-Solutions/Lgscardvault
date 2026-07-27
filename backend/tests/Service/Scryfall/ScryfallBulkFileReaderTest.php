<?php

namespace App\Tests\Service\Scryfall;

use App\Service\Scryfall\ScryfallBulkFileReader;
use PHPUnit\Framework\TestCase;

/**
 * The reader is what keeps the bulk sync working across Scryfall's format
 * migration: gzipped JSONL is the only format served after 2026-07-20, but
 * the legacy single-JSON-array format must keep parsing for as long as any
 * mirror or cached download still produces it. Every combination is sniffed
 * from file content, never from names or headers.
 */
final class ScryfallBulkFileReaderTest extends TestCase
{
    private ScryfallBulkFileReader $reader;

    /** @var list<string> */
    private array $tempFiles = [];

    protected function setUp(): void
    {
        $this->reader = new ScryfallBulkFileReader();
    }

    protected function tearDown(): void
    {
        foreach ($this->tempFiles as $path) {
            @unlink($path);
        }
        $this->tempFiles = [];
    }

    public function testReadsGzippedJsonl(): void
    {
        $path = $this->makeFile(gzencode(
            '{"id":"aaa","name":"Lightning Bolt"}'."\n".
            '{"id":"bbb","name":"Counterspell"}'."\n"
        ));

        self::assertSame(
            [['id' => 'aaa', 'name' => 'Lightning Bolt'], ['id' => 'bbb', 'name' => 'Counterspell']],
            iterator_to_array($this->reader->cards($path), false),
        );
    }

    public function testReadsPlainJsonl(): void
    {
        $path = $this->makeFile(
            '{"id":"aaa"}'."\n".
            '{"id":"bbb"}'
        );

        self::assertSame(
            [['id' => 'aaa'], ['id' => 'bbb']],
            iterator_to_array($this->reader->cards($path), false),
        );
    }

    public function testSkipsBlankJsonlLines(): void
    {
        $path = $this->makeFile(
            '{"id":"aaa"}'."\n\n".
            '{"id":"bbb"}'."\n\n"
        );

        self::assertSame(
            [['id' => 'aaa'], ['id' => 'bbb']],
            iterator_to_array($this->reader->cards($path), false),
        );
    }

    public function testReadsLegacyJsonArray(): void
    {
        $path = $this->makeFile('[{"id":"aaa"},{"id":"bbb"}]');

        self::assertSame(
            [['id' => 'aaa'], ['id' => 'bbb']],
            iterator_to_array($this->reader->cards($path), false),
        );
    }

    public function testReadsGzippedLegacyJsonArray(): void
    {
        $path = $this->makeFile(gzencode("[\n  {\"id\":\"aaa\"},\n  {\"id\":\"bbb\"}\n]"));

        self::assertSame(
            [['id' => 'aaa'], ['id' => 'bbb']],
            iterator_to_array($this->reader->cards($path), false),
        );
    }

    public function testThrowsOnCorruptJsonlLine(): void
    {
        $path = $this->makeFile(
            '{"id":"aaa"}'."\n".
            '{"id":"bbb", TRUNCATED'
        );

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('line 2');

        iterator_to_array($this->reader->cards($path), false);
    }

    public function testThrowsOnUnrecognizedFormat(): void
    {
        $path = $this->makeFile('not json at all');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Unrecognized Scryfall bulk format');

        iterator_to_array($this->reader->cards($path), false);
    }

    public function testThrowsOnEmptyFile(): void
    {
        $path = $this->makeFile('');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('empty file');

        iterator_to_array($this->reader->cards($path), false);
    }

    private function makeFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'scryfall_bulk_test_');
        self::assertNotFalse($path);
        file_put_contents($path, $contents);
        $this->tempFiles[] = $path;

        return $path;
    }
}
