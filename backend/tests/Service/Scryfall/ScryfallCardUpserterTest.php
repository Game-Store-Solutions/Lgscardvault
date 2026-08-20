<?php

namespace App\Tests\Service\Scryfall;

use App\Service\Scryfall\ScryfallCardUpserter;
use App\Tests\Support\CatalogFixtures;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * The upserter is the concurrency-safety linchpin: it replaced a
 * find->persist->flush path that crashed whole import batches when parallel
 * workers inserted the same Scryfall id. These tests pin the ON CONFLICT
 * insert/update semantics and the in-batch de-dup that make that safe.
 */
final class ScryfallCardUpserterTest extends KernelTestCase
{
    private Connection $connection;
    private ScryfallCardUpserter $upserter;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->connection = self::getContainer()->get('doctrine')->getConnection();
        $this->upserter = new ScryfallCardUpserter($this->connection);
    }

    public function testFreshPayloadsInsert(): void
    {
        $result = $this->upserter->upsertMany([
            CatalogFixtures::scryfallPayload(1),
            CatalogFixtures::scryfallPayload(2),
        ]);

        self::assertSame(2, $result['inserted']);
        self::assertSame(0, $result['updated']);
        self::assertSame(0, $result['skipped']);
    }

    public function testReUpsertUpdatesInsteadOfViolatingUnique(): void
    {
        // The exact scenario that crashed the old code: the same id written twice.
        $this->upserter->upsertMany([CatalogFixtures::scryfallPayload(1)]);
        $result = $this->upserter->upsertMany([
            CatalogFixtures::scryfallPayload(1, ['name' => 'Renamed']),
        ]);

        self::assertSame(0, $result['inserted']);
        self::assertSame(1, $result['updated']);
        self::assertSame(
            'Renamed',
            $this->connection->fetchOne('SELECT name FROM cards WHERE collector_number = ?', ['1']),
        );
    }

    public function testDuplicateIdsWithinOneBatchCollapseToLastWins(): void
    {
        // ON CONFLICT cannot touch the same row twice in one statement, so the
        // upserter must de-dup the batch (last occurrence wins) instead of erroring.
        $result = $this->upserter->upsertMany([
            CatalogFixtures::scryfallPayload(1, ['name' => 'First']),
            CatalogFixtures::scryfallPayload(1, ['name' => 'Last']),
        ]);

        self::assertSame(1, $result['inserted'] + $result['updated']);
        self::assertSame(
            'Last',
            $this->connection->fetchOne('SELECT name FROM cards WHERE collector_number = ?', ['1']),
        );
    }

    public function testPayloadMissingIdentityIsSkipped(): void
    {
        $result = $this->upserter->upsertMany([
            ['name' => 'No id or oracle_id'],
            CatalogFixtures::scryfallPayload(3),
        ]);

        self::assertSame(1, $result['inserted']);
        self::assertSame(1, $result['skipped']);
    }

    public function testUpsertOneReportsStatus(): void
    {
        self::assertSame('inserted', $this->upserter->upsertOne(CatalogFixtures::scryfallPayload(9)));
        self::assertSame('updated', $this->upserter->upsertOne(CatalogFixtures::scryfallPayload(9)));
        self::assertSame('skipped', $this->upserter->upsertOne(['no' => 'id']));
    }

    public function testMultibyteNameIsTruncatedWithoutSplittingCharacters(): void
    {
        // Truncation must not slice a UTF-8 sequence and corrupt the write.
        // 300 two-byte chars (600 bytes) exceeds the 255-char column.
        $name = str_repeat('é', 300);
        $this->upserter->upsertOne(CatalogFixtures::scryfallPayload(4, ['name' => $name]));

        $stored = $this->connection->fetchOne('SELECT name FROM cards WHERE collector_number = ?', ['4']);
        self::assertNotFalse($stored);
        // Valid UTF-8 (no replacement chars / broken tail) and within the column
        // width — VARCHAR(255) counts characters, so 255 two-byte é's is legal.
        self::assertTrue(mb_check_encoding($stored, 'UTF-8'));
        self::assertLessThanOrEqual(255, mb_strlen($stored));
        self::assertSame(255, mb_strlen($stored));
    }

    public function testArtistCreditsIncludeTopLevelAndFaceNames(): void
    {
        $this->upserter->upsertOne(CatalogFixtures::scryfallPayload(12, [
            'artist' => 'Someone Else',
            'card_faces' => [
                ['name' => 'Front', 'artist' => 'Chris Rahn'],
                ['name' => 'Back', 'artist' => 'Chris Rahn'],
            ],
        ]));

        $raw = $this->connection->fetchOne('SELECT artist_credits FROM cards WHERE collector_number = ?', ['12']);
        self::assertNotFalse($raw);
        $credits = is_array($raw) ? $raw : json_decode((string) $raw, true);
        self::assertIsArray($credits);
        sort($credits);
        self::assertSame(['chris rahn', 'someone else'], $credits);
    }
}
