<?php

namespace App\Tests\Service\Tcgcsv;

use App\Entity\CatalogSyncRun;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\CatalogSyncRunRepository;
use App\Repository\GameRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use App\Service\Doctrine\SqlDebugLogPruner;
use App\Service\Tcgcsv\CatalogSynchronizer;
use App\Service\Tcgcsv\CatalogSyncRunner;
use App\Service\Tcgcsv\TcgcsvClient;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\NullLogger;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * A worker killed mid-sync (out of memory, restart) cannot record its own
 * failure, so the run would sit at RUNNING forever and the Sync Jobs view
 * would show an import that never finishes. These cover the heartbeat that
 * proves a run is alive and the reaping that closes out dead ones.
 */
final class InterruptedSyncRecoveryTest extends KernelTestCase
{
    private const BASE_URI = 'https://tcgcsv.com/tcgplayer/';

    private EntityManagerInterface $em;
    private CatalogSyncRunRepository $runs;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get(EntityManagerInterface::class);
        $this->runs = $c->get(CatalogSyncRunRepository::class);
    }

    private function runner(callable $handler): CatalogSyncRunner
    {
        $c = static::getContainer();

        return new CatalogSyncRunner(
            new CatalogSynchronizer(
                new TcgcsvClient(new MockHttpClient($handler, self::BASE_URI), requestIntervalUs: 0),
                $this->em,
                $c->get(GameSetRepository::class),
                $c->get(SealedProductRepository::class),
                $c->get(CardRepository::class),
                new SqlDebugLogPruner(),
                new NullLogger(),
            ),
            $c->get(GameRepository::class),
            $this->runs,
            $this->em,
            new NullLogger(),
        );
    }

    /** Simulates a process that died mid-sync: RUNNING, no heartbeat since. */
    private function orphanedRun(string $gameCode, string $lastSeen): CatalogSyncRun
    {
        $game = $this->em->getRepository(Game::class)->findOneBy(['code' => $gameCode]);
        self::assertNotNull($game);

        $run = new CatalogSyncRun();
        $run->setGame($game);
        $this->em->persist($run);
        $this->em->flush();

        // started_at/heartbeat_at are set in code, so age them in SQL.
        $this->em->getConnection()->executeStatement(
            'UPDATE catalog_sync_runs SET started_at = :at, heartbeat_at = :at WHERE id = :id',
            ['at' => $lastSeen, 'id' => $run->getId()],
        );
        $this->em->refresh($run);

        return $run;
    }

    public function testStaleRunningRunIsMarkedInterrupted(): void
    {
        $stale = $this->orphanedRun('pokemon', (new \DateTimeImmutable('-2 hours'))->format('Y-m-d H:i:s'));
        $fresh = $this->orphanedRun('fab', (new \DateTimeImmutable('-10 seconds'))->format('Y-m-d H:i:s'));

        $reaped = $this->runner(static fn (): MockResponse => new MockResponse('{"results":[]}'))->failStaleRuns();

        self::assertSame(1, $reaped, 'only the run without a recent heartbeat is reaped');

        $this->em->refresh($stale);
        $this->em->refresh($fresh);
        self::assertSame(CatalogSyncRun::STATUS_FAILED, $stale->getStatus());
        self::assertNotNull($stale->getFinishedAt());
        self::assertStringContainsString('Interrupted', (string) $stale->getError());
        self::assertSame(CatalogSyncRun::STATUS_RUNNING, $fresh->getStatus(), 'a live sync keeps running');
    }

    public function testRunFinishesAndBeatsEvenThoughTheSyncClearsTheEntityManager(): void
    {
        // Two sets, so the synchronizer clears the entity manager mid-run —
        // the run row must survive that and still reach a terminal state.
        $run = $this->runner(function (string $method, string $url): MockResponse {
            if (str_ends_with($url, '/68/groups')) {
                return new MockResponse(json_encode(['results' => [
                    ['groupId' => 31001, 'name' => 'Set One', 'abbreviation' => 'S1'],
                    ['groupId' => 31002, 'name' => 'Set Two', 'abbreviation' => 'S2'],
                ]]));
            }
            if (str_ends_with($url, '/products')) {
                return new MockResponse(json_encode(['results' => [
                    ['productId' => 610001, 'name' => 'A Booster Box', 'extendedData' => []],
                ]]));
            }

            return new MockResponse(json_encode(['results' => []]));
        })->run('onepiece');

        self::assertSame(CatalogSyncRun::STATUS_SUCCEEDED, $run->getStatus());
        self::assertNotNull($run->getFinishedAt());
        self::assertSame(2, $run->getSummary()['groupsSeen'] ?? null);
        self::assertNotNull($run->getHeartbeatAt(), 'the run is stamped alive when it starts');

        // The terminal state is what actually got written, not just in memory.
        $this->em->clear();
        $reloaded = $this->runs->find((int) $run->getId());
        self::assertSame(CatalogSyncRun::STATUS_SUCCEEDED, $reloaded?->getStatus());
    }

    public function testStartingARunClosesOutAnOrphanFirst(): void
    {
        $orphan = $this->orphanedRun('onepiece', (new \DateTimeImmutable('-2 hours'))->format('Y-m-d H:i:s'));

        $this->runner(static fn (): MockResponse => new MockResponse('{"results":[]}'))->run('onepiece');

        $this->em->refresh($orphan);
        self::assertSame(
            CatalogSyncRun::STATUS_FAILED,
            $orphan->getStatus(),
            'one game never shows two runs in progress at once',
        );
    }
}
