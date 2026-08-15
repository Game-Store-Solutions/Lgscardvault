<?php

namespace App\Tests\Controller;

use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Entity\Store;
use App\Entity\User;
use App\Service\Recovery\RecoveryCardFinder;
use App\Service\Recovery\RecoveryErrorClassifier;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * The isolated failed-row recovery API.
 *
 * These endpoints are scoped to one store and one import job so recovery can
 * never reshape the shared /api/catalog/search that the rest of the app reads.
 */
final class StoreImportRecoveryControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private Store $store;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->store = $this->fixtures->store('recovery-api-store');
        $this->authenticate($this->store->getOwner());
    }

    /**
     * Lexik JWT is stateless, so a session login only survives one request.
     * Recovery is inherently multi-request (search, then resolve, then next
     * row), so these tests carry an explicit Bearer token throughout.
     */
    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @param list<array{name: string, set: string, collector: string, error: string}> $rows */
    private function jobWithFailedRows(array $rows): CsvImportJob
    {
        $job = new CsvImportJob();
        $job->setStore($this->store);
        $job->setStatus(CsvImportJob::STATUS_COMPLETED);
        $job->setOriginalFilename('t.csv');
        $job->setStoragePath('');
        $job->setTotalRows(count($rows));
        $job->setProcessedRows(count($rows));
        $job->setFailedRows(count($rows));
        $this->em->persist($job);

        foreach ($rows as $index => $spec) {
            $row = new CsvImportRow();
            $row->setJob($job);
            $row->setRowIndex($index);
            $row->setName($spec['name']);
            $row->setSetCode($spec['set']);
            $row->setCollectorNumber($spec['collector']);
            $row->setQuantity(2);
            $row->setStatus(CsvImportRow::STATUS_ERROR);
            $row->setError($spec['error']);
            $this->em->persist($row);
        }

        $this->em->flush();

        return $job;
    }

    private function request(string $method, string $path, array $query = []): void
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $queryString = http_build_query($query);
        $this->client->request($method, $path.('' === $queryString ? '' : '?'.$queryString), server: $server);
    }

    private function get(string $path, array $query = []): array
    {
        $this->request('GET', $path, $query);
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true);
    }

    private function post(string $path): array
    {
        $this->request('POST', $path);
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true);
    }

    private function base(CsvImportJob $job): string
    {
        return sprintf('/api/stores/%s/csv-imports/%d/recovery', $this->store->getSlug(), $job->getId());
    }

    public function testQueueGroupsRowsByErrorReason(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'A', 'set' => 'mh3', 'collector' => '1', 'error' => 'No market price available for this printing (priced at $0).'],
            ['name' => 'B', 'set' => 'mh3', 'collector' => '2', 'error' => 'No market price available for this printing (priced at $0).'],
            ['name' => 'C', 'set' => 'mh3', 'collector' => '3', 'error' => 'No matching MTGJSON or Scryfall printing found.'],
        ]);

        $body = $this->get($this->base($job).'/queue');

        self::assertSame('mtg', $body['gameCode']);
        self::assertCount(3, $body['rows']);
        // Biggest bucket first, so the operator attacks the common cause.
        self::assertSame(RecoveryErrorClassifier::NO_MARKET_PRICE, $body['groups'][0]['reason']);
        self::assertSame(2, $body['groups'][0]['count']);
        self::assertSame(RecoveryErrorClassifier::NO_MATCH, $body['groups'][1]['reason']);
    }

    public function testSearchFindsPaperPrintingBehindAnAlchemyRow(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'A-Guide of Souls', 'set' => 'mh3', 'collector' => 'A-29', 'error' => 'Online-only printing.'],
        ]);
        $this->fixtures->card(20, [
            'name' => 'Guide of Souls', 'set' => 'mh3', 'collector_number' => '20',
            'games' => ['paper', 'arena'], 'prices' => ['usd' => '2.50'],
        ]);
        $this->fixtures->card(29, [
            'name' => 'A-Guide of Souls', 'set' => 'mh3', 'collector_number' => 'A-29',
            'games' => ['arena'], 'digital' => true, 'prices' => ['usd' => null],
        ]);

        $body = $this->get($this->base($job).'/search', [
            'q' => 'A-Guide of Souls',
            'set' => 'mh3',
            'collectorNumber' => 'A-29',
            'finish' => 'nonfoil',
        ]);

        self::assertCount(1, $body['items']);
        self::assertSame('Guide of Souls', $body['items'][0]['name']);
        self::assertContains(RecoveryCardFinder::RELAXED_COLLECTOR, $body['relaxed']);

        // The digital printing is explained rather than hidden.
        self::assertCount(1, $body['rejected']);
        self::assertSame('A-Guide of Souls', $body['rejected'][0]['card']['name']);
    }

    public function testReferenceResolvesSetAndCollectorPair(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Sol Ring', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
        ]);
        $this->fixtures->card(1, [
            'name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263',
            'games' => ['paper'], 'prices' => ['usd' => '1.50'],
        ]);

        $body = $this->get($this->base($job).'/reference', ['ref' => 'c21/263']);

        self::assertSame('Sol Ring', $body['card']['name']);
    }

    public function testReferenceResolvesAFullScryfallUrl(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Sol Ring', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
        ]);
        $this->fixtures->card(1, [
            'name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263',
            'games' => ['paper'], 'prices' => ['usd' => '1.50'],
        ]);

        $body = $this->get($this->base($job).'/reference', [
            'ref' => 'https://scryfall.com/card/c21/263/sol-ring',
        ]);

        self::assertSame('Sol Ring', $body['card']['name']);
    }

    public function testReferenceResolvesCardId(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Sol Ring', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
        ]);
        $card = $this->fixtures->card(1, [
            'name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263',
            'games' => ['paper'], 'prices' => ['usd' => '1.50'],
        ]);

        $body = $this->get($this->base($job).'/reference', ['ref' => (string) $card->getId()]);

        self::assertSame('Sol Ring', $body['card']['name']);
    }

    public function testReferenceRejectsAnOnlineOnlyPrinting(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'A-Guide of Souls', 'set' => 'mh3', 'collector' => 'A-29', 'error' => 'Online-only printing.'],
        ]);
        $this->fixtures->card(29, [
            'name' => 'A-Guide of Souls', 'set' => 'mh3', 'collector_number' => 'A-29',
            'games' => ['arena'], 'digital' => true,
        ]);

        $this->request('GET', $this->base($job).'/reference', ['ref' => 'mh3/A-29']);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertStringContainsString('paper', strtolower($body['detail']));
    }

    public function testReferenceRejectsGarbageInput(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Sol Ring', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
        ]);

        // Never hand an arbitrary string to an outbound fetch.
        $this->request('GET', $this->base($job).'/reference', ['ref' => 'http://169.254.169.254/latest/meta-data/']);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }

    public function testSkippingTheLastFailedRowLetsTheJobComplete(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Nonsense', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
        ]);

        $body = $this->post($this->base($job).'/rows/0/skip');

        self::assertSame(CsvImportRow::STATUS_SKIPPED, $body['row']['status']);
        self::assertSame(0, $body['counts']['error']);
        self::assertSame(1, $body['counts']['skipped']);

        $jobId = (int) $job->getId();
        $this->em->clear();
        $job = $this->em->find(CsvImportJob::class, $jobId);
        self::assertInstanceOf(CsvImportJob::class, $job);
        self::assertSame(0, $job->getFailedRows());
        self::assertSame(1, $job->getProcessedRows());
        self::assertSame(CsvImportJob::STATUS_COMPLETED, $job->getStatus());

        // And it can be brought back if the operator changes their mind.
        $restored = $this->post($this->base($job).'/rows/0/unskip');
        self::assertSame(CsvImportRow::STATUS_ERROR, $restored['row']['status']);
        $this->em->clear();
        $job = $this->em->find(CsvImportJob::class, $jobId);
        self::assertInstanceOf(CsvImportJob::class, $job);
        self::assertSame(1, $job->getFailedRows());
        self::assertSame(CsvImportJob::STATUS_FAILED, $job->getStatus());
    }

    public function testSkippedRowsLeaveTheActiveQueue(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Keep', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
            ['name' => 'Drop', 'set' => '', 'collector' => '', 'error' => 'No matching printing found.'],
        ]);

        $this->post($this->base($job).'/rows/1/skip');

        $body = $this->get($this->base($job).'/queue');

        // Both rows are still listed (a skip is reversible), but only the
        // unresolved one counts toward the work remaining.
        self::assertCount(2, $body['rows']);
        self::assertSame(1, array_sum(array_column($body['groups'], 'count')));
    }

    public function testSearchRejectsAnUnpricedPaperPrinting(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Bulk Rare', 'set' => 'mh3', 'collector' => '1', 'error' => 'No market price available for this printing (priced at $0).'],
        ]);
        $this->fixtures->card(1, [
            'name' => 'Bulk Rare', 'set' => 'mh3', 'collector_number' => '1',
            'games' => ['paper'], 'prices' => ['usd' => '0.00'],
        ]);

        $body = $this->get($this->base($job).'/search', [
            'q' => 'Bulk Rare',
            'set' => 'mh3',
            'collectorNumber' => '1',
            'finish' => 'nonfoil',
        ]);

        self::assertSame([], $body['items']);
        self::assertCount(1, $body['rejected']);
        self::assertStringContainsString('$0', $body['rejected'][0]['reason']);
    }

    public function testReferenceRejectsAnUnpricedPaperPrinting(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Bulk Rare', 'set' => 'mh3', 'collector' => '1', 'error' => 'No market price available for this printing (priced at $0).'],
        ]);
        $this->fixtures->card(1, [
            'name' => 'Bulk Rare', 'set' => 'mh3', 'collector_number' => '1',
            'games' => ['paper'], 'prices' => ['usd' => '0.00'],
        ]);

        $this->request('GET', $this->base($job).'/reference', ['ref' => 'mh3/1']);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertStringContainsString('$0', $body['detail']);
    }

    public function testAnotherStoresOwnerIsRefused(): void
    {
        $job = $this->jobWithFailedRows([
            ['name' => 'Sol Ring', 'set' => 'c21', 'collector' => '263', 'error' => 'No matching printing found.'],
        ]);

        $this->authenticate($this->fixtures->user(['ROLE_USER']));
        $this->request('GET', $this->base($job).'/queue');

        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }
}
