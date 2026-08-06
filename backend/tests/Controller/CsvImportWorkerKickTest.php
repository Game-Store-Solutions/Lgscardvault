<?php

namespace App\Tests\Controller;

use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Entity\Store;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * When the worker dies between batches, queued rows sit idle until something
 * re-dispatches ProcessCsvImportMessage. Polling the imports API kicks that.
 */
final class CsvImportWorkerKickTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    private function jsonRequest(string $method, string $url): array
    {
        $this->client->request($method, $url, server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
        ]);
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function idleProcessingJob(Store $store): CsvImportJob
    {
        $job = new CsvImportJob();
        $job->setStore($store);
        $job->setOriginalFilename('idle.csv');
        $job->setStoragePath('');
        $job->setStatus(CsvImportJob::STATUS_PROCESSING);
        $job->setTotalRows(3);
        $job->setProcessedRows(1);
        $job->setImportedRows(1);
        $this->em->persist($job);

        $this->em->persist(
            (new CsvImportRow())
                ->setJob($job)
                ->setRowIndex(0)
                ->setName('Done')
                ->setQuantity(1)
                ->setStatus(CsvImportRow::STATUS_IMPORTED),
        );
        $this->em->persist(
            (new CsvImportRow())
                ->setJob($job)
                ->setRowIndex(1)
                ->setName('Waiting')
                ->setQuantity(1)
                ->setStatus(CsvImportRow::STATUS_QUEUED),
        );
        $this->em->flush();

        $this->em->getConnection()->executeStatement(
            'UPDATE csv_import_jobs SET updated_at = :at WHERE id = :id',
            ['at' => (new \DateTimeImmutable('-2 minutes'))->format('Y-m-d H:i:s'), 'id' => $job->getId()],
        );
        $this->em->refresh($job);

        return $job;
    }

    public function testCurrentImportPollKicksIdleQueuedWork(): void
    {
        $store = $this->fixtures->store();
        $job = $this->idleProcessingJob($store);

        $this->authenticate($store->getOwner());
        $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports/current?rowLimit=25");

        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        $touched = $this->em->getRepository(CsvImportJob::class)->find($job->getId());
        self::assertNotNull($touched);
        self::assertGreaterThan(
            new \DateTimeImmutable('-1 minute'),
            $touched->getUpdatedAt(),
            'kick should touch the job so the worker message was scheduled',
        );
    }
}
