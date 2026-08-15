<?php

namespace App\Tests\Controller;

use App\Entity\Card;
use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Entity\Store;
use App\Repository\InventoryItemRepository;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * The CSV failed-row recovery flows: per-row manual import, batch retry of all
 * failed rows, and the failed-row preview. These are the flows the user drives
 * from the import run page after a batch leaves some rows unmatched.
 */
final class CsvImportRecoveryTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private InventoryItemRepository $items;
    private object $client;
    private Store $store;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->items = $c->get(InventoryItemRepository::class);
        $this->fixtures = new CatalogFixtures($this->em);
        $this->store = $this->fixtures->store('recovery-store');
        // The store's owner is authorized for STORE_MANAGE.
        $this->client->loginUser($this->store->getOwner());
    }

    private function jobWithFailedRow(string $name, string $set, string $collector): array
    {
        $job = new CsvImportJob();
        $job->setStore($this->store);
        $job->setStatus(CsvImportJob::STATUS_COMPLETED);
        $job->setOriginalFilename('t.csv');
        $job->setStoragePath('');
        $job->setTotalRows(1);
        $job->setProcessedRows(1);
        $job->setFailedRows(1);
        $this->em->persist($job);

        $row = new CsvImportRow();
        $row->setJob($job);
        $row->setRowIndex(0);
        $row->setName($name);
        $row->setSetCode($set);
        $row->setCollectorNumber($collector);
        $row->setQuantity(2);
        $row->setStatus(CsvImportRow::STATUS_ERROR);
        $row->setError('No matching printing found.');
        $this->em->persist($row);
        $this->em->flush();

        return [$job, $row];
    }

    public function testManualImportRowResolvesFailedRowIntoInventory(): void
    {
        [$job] = $this->jobWithFailedRow('Sol Ring', 'c21', '263');
        $card = $this->fixtures->card(1, ['name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263']);

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/csv-imports/%d/rows/0/manual-import', $this->store->getSlug(), $job->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['cardId' => (string) $card->getId(), 'quantity' => 2, 'condition' => 'NM', 'isFoil' => false]),
        );

        self::assertResponseIsSuccessful();

        $this->em->clear();
        $row = $this->em->getRepository(CsvImportRow::class)->findOneBy(['job' => $job->getId(), 'rowIndex' => 0]);
        self::assertSame(CsvImportRow::STATUS_IMPORTED, $row->getStatus());
        self::assertNotNull($row->getImportedItemId());

        $store = $this->em->getRepository(Store::class)->find($this->store->getId());
        self::assertSame(1, $this->items->countByStore($store), 'the resolved card should now be in inventory');
    }

    public function testManualImportRowRejectsUnknownCard(): void
    {
        [$job] = $this->jobWithFailedRow('Sol Ring', 'c21', '263');

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/csv-imports/%d/rows/0/manual-import', $this->store->getSlug(), $job->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['cardId' => '11111111-2222-4333-8444-555566667777']),
        );

        self::assertSame(404, $this->client->getResponse()->getStatusCode());
    }

    public function testRetryFailedRequeuesErrorRows(): void
    {
        [$job, $row] = $this->jobWithFailedRow('Sol Ring', 'c21', '263');

        $this->client->request('POST', sprintf('/api/stores/%s/csv-imports/%d/retry-failed', $this->store->getSlug(), $job->getId()));
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $reloaded = $this->em->getRepository(CsvImportRow::class)->find($row->getId());
        self::assertSame(CsvImportRow::STATUS_QUEUED, $reloaded->getStatus(), 'failed rows are requeued for reprocessing');
        self::assertNull($reloaded->getError());
    }

    public function testFailedPreviewMatchesByNaturalKey(): void
    {
        [$job] = $this->jobWithFailedRow('Sol Ring', 'c21', '263');
        $this->fixtures->card(1, ['name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263']);

        $this->client->request('POST', sprintf('/api/stores/%s/csv-imports/%d/failed/preview', $this->store->getSlug(), $job->getId()));
        self::assertResponseIsSuccessful();

        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame(1, $body['totalFailedRows']);
        self::assertCount(1, $body['results']);
        self::assertArrayHasKey('card', $body['results'][0], 'the failed row should preview a matched card');
        self::assertSame('Sol Ring', $body['results'][0]['card']['name']);
    }

    /**
     * Regression: CSVs that export the full set NAME ("Commander 2021")
     * instead of the code ("c21") used to fail every match — the resolver now
     * normalizes names to codes via the local catalog, so the preview matches.
     */
    public function testFailedPreviewResolvesFullSetNames(): void
    {
        [$job] = $this->jobWithFailedRow('Sol Ring', 'COMMANDER 2021', '263');
        $this->fixtures->card(1, ['name' => 'Sol Ring', 'set' => 'c21', 'set_name' => 'Commander 2021', 'collector_number' => '263']);

        $this->client->request('POST', sprintf('/api/stores/%s/csv-imports/%d/failed/preview', $this->store->getSlug(), $job->getId()));
        self::assertResponseIsSuccessful();

        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertArrayHasKey('card', $body['results'][0], 'a set-name row should still preview a matched card');
        self::assertSame('Sol Ring', $body['results'][0]['card']['name']);
        self::assertSame('c21', $body['results'][0]['card']['setCode']);
    }

    public function testRecoveryEndpointsRejectNonOwner(): void
    {
        [$job] = $this->jobWithFailedRow('Sol Ring', 'c21', '263');

        // A different, unrelated user must not touch this store's import.
        $this->client->loginUser($this->fixtures->user(['ROLE_USER']));
        $this->client->request('POST', sprintf('/api/stores/%s/csv-imports/%d/retry-failed', $this->store->getSlug(), $job->getId()));

        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    /**
     * Regression: the upload endpoint runs ApiRateLimit::enforce() before the
     * file check, so a POST with no file still executes that line. If the
     * controller is missing `use App\Security\ApiRateLimit;`, PHP tries to load
     * App\Controller\ApiRateLimit and fatals — every upload 500s. We assert the
     * benign 400 ("a CSV file is required") to prove the class resolves.
     */
    public function testUploadEndpointResolvesRateLimiter(): void
    {
        $this->client->request('POST', sprintf('/api/stores/%s/csv-imports', $this->store->getSlug()));

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    public function testManualImportStocksUnpricedPaperWhenPriceCentsProvided(): void
    {
        [$job] = $this->jobWithFailedRow('Obscure Bulk', 'mh3', '1');
        $card = $this->fixtures->card(910, [
            'name' => 'Obscure Bulk',
            'set' => 'mh3',
            'collector_number' => '1',
            'games' => ['paper'],
            'prices' => ['usd' => '0.00', 'usd_foil' => null],
        ]);

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/csv-imports/%d/rows/0/manual-import', $this->store->getSlug(), $job->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'cardId' => (string) $card->getId(),
                'quantity' => 2,
                'condition' => 'NM',
                'isFoil' => false,
                'priceCents' => 150,
            ]),
        );

        self::assertResponseIsSuccessful();

        $this->em->clear();
        $row = $this->em->getRepository(CsvImportRow::class)->findOneBy(['job' => $job->getId(), 'rowIndex' => 0]);
        self::assertSame(CsvImportRow::STATUS_IMPORTED, $row->getStatus());
        self::assertSame(150, $row->getPriceCents());

        $store = $this->em->getRepository(Store::class)->find($this->store->getId());
        $items = $this->items->findBy(['store' => $store]);
        self::assertCount(1, $items);
        self::assertSame(150, $items[0]->getPriceCents(), 'the operator-entered sell price is what gets listed');
    }

    public function testManualImportRejectsUnpricedPaperWithoutPrice(): void
    {
        [$job] = $this->jobWithFailedRow('Obscure Bulk', 'mh3', '1');
        $card = $this->fixtures->card(911, [
            'name' => 'Obscure Bulk',
            'set' => 'mh3',
            'collector_number' => '1',
            'games' => ['paper'],
            'prices' => ['usd' => '0.00'],
        ]);

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/csv-imports/%d/rows/0/manual-import', $this->store->getSlug(), $job->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'cardId' => (string) $card->getId(),
                'quantity' => 1,
                'condition' => 'NM',
                'isFoil' => false,
            ]),
        );

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertStringContainsString('$0', (string) ($body['detail'] ?? ''));
        self::assertSame(0, $this->items->countByStore($this->em->getRepository(Store::class)->find($this->store->getId())));
    }

    public function testManualImportRejectsOnlineOnlyEvenWithPrice(): void
    {
        [$job] = $this->jobWithFailedRow('A-Guide of Souls', 'mh3', 'A-29');
        $card = $this->fixtures->card(912, [
            'name' => 'A-Guide of Souls',
            'set' => 'mh3',
            'collector_number' => 'A-29',
            'games' => ['arena'],
            'digital' => true,
            'prices' => ['usd' => null],
        ]);

        $this->client->request(
            'POST',
            sprintf('/api/stores/%s/csv-imports/%d/rows/0/manual-import', $this->store->getSlug(), $job->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'cardId' => (string) $card->getId(),
                'quantity' => 1,
                'condition' => 'NM',
                'isFoil' => false,
                'priceCents' => 500,
            ]),
        );

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertStringContainsString('online', strtolower((string) ($body['detail'] ?? '')));
    }

    public function testPatchPersistsSellPriceOnFailedRow(): void
    {
        [$job] = $this->jobWithFailedRow('Obscure Bulk', 'mh3', '1');

        $this->client->request(
            'PATCH',
            sprintf('/api/stores/%s/csv-imports/%d/rows/0', $this->store->getSlug(), $job->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['priceCents' => 250]),
        );

        self::assertResponseIsSuccessful();
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame(250, $body['priceCents']);

        $this->em->clear();
        $row = $this->em->getRepository(CsvImportRow::class)->findOneBy(['job' => $job->getId(), 'rowIndex' => 0]);
        self::assertSame(250, $row->getPriceCents());
    }
}
