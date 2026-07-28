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
 * When a worker dies mid-import (out of memory, restart, deploy) the job is
 * left at PROCESSING with rows claimed and nothing to requeue them — staff
 * see an import frozen forever. Viewing the imports list recovers it.
 */
final class StalledImportRecoveryTest extends WebTestCase
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

    /**
     * Builds a job frozen mid-flight: PROCESSING, one row still claimed, and
     * no progress since $lastProgress.
     */
    private function stalledJob(Store $store, string $lastProgress): CsvImportJob
    {
        $job = new CsvImportJob();
        $job->setStore($store);
        $job->setOriginalFilename('frozen.csv');
        $job->setStoragePath('');
        $job->setStatus(CsvImportJob::STATUS_PROCESSING);
        $job->setTotalRows(2);
        $job->setProcessedRows(1);
        $job->setImportedRows(1);
        $this->em->persist($job);

        $claimed = (new CsvImportRow())
            ->setJob($job)
            ->setRowIndex(1)
            ->setName('Abandoned Row')
            ->setQuantity(1)
            ->setStatus(CsvImportRow::STATUS_PROCESSING);
        $this->em->persist($claimed);
        $this->em->flush();

        // updated_at/claimed_at are written in PHP, so age them in SQL.
        $this->em->getConnection()->executeStatement(
            'UPDATE csv_import_jobs SET updated_at = :at WHERE id = :id',
            ['at' => $lastProgress, 'id' => $job->getId()],
        );
        $this->em->getConnection()->executeStatement(
            'UPDATE csv_import_rows SET claimed_at = :at WHERE id = :id',
            ['at' => $lastProgress, 'id' => $claimed->getId()],
        );
        $this->em->refresh($job);

        return $job;
    }

    public function testViewingImportsRequeuesAJobAbandonedByADeadWorker(): void
    {
        $store = $this->fixtures->store();
        $stalled = $this->stalledJob($store, (new \DateTimeImmutable('-1 hour'))->format('Y-m-d H:i:s'));

        $this->authenticate($store->getOwner());
        $runs = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports");
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        $recovered = $this->em->getRepository(CsvImportJob::class)->find($stalled->getId());
        self::assertSame(
            CsvImportJob::STATUS_QUEUED,
            $recovered?->getStatus(),
            'the frozen job goes back in the queue instead of sitting at processing',
        );

        // Its abandoned row is claimable again, so the import can finish.
        $rows = $this->em->getRepository(CsvImportRow::class)->findBy(['job' => $recovered]);
        self::assertSame(CsvImportRow::STATUS_QUEUED, $rows[0]->getStatus());
        self::assertNotSame([], $runs);
    }

    public function testAJobStillMakingProgressIsLeftAlone(): void
    {
        $store = $this->fixtures->store();
        $live = $this->stalledJob($store, (new \DateTimeImmutable('-5 seconds'))->format('Y-m-d H:i:s'));

        $this->authenticate($store->getOwner());
        $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports");

        $this->em->clear();
        $untouched = $this->em->getRepository(CsvImportJob::class)->find($live->getId());
        self::assertSame(
            CsvImportJob::STATUS_PROCESSING,
            $untouched?->getStatus(),
            'a live worker must never have its job requeued underneath it',
        );

        $rows = $this->em->getRepository(CsvImportRow::class)->findBy(['job' => $untouched]);
        self::assertSame(CsvImportRow::STATUS_PROCESSING, $rows[0]->getStatus(), 'in-flight rows stay claimed');
    }
}
