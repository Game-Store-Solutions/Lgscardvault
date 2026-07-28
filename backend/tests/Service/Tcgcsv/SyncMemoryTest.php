<?php

namespace App\Tests\Service\Tcgcsv;

use App\Repository\CardRepository;
use App\Repository\GameRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use App\Service\Doctrine\SqlDebugLogPruner;
use App\Service\Tcgcsv\CatalogSynchronizer;
use App\Service\Tcgcsv\TcgcsvClient;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\NullLogger;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * A full game is ~1000 sets and tens of thousands of products. Before the
 * per-set clear() every one of those entities stayed in the identity map
 * (and, in debug mode, every query stayed in the profiler's buffer) until
 * the process died:
 *
 *   PHP Fatal error: Allowed memory size of 134217728 bytes exhausted
 *
 * This pins the fix down where it matters: the number of entities Doctrine
 * is holding must not grow with the number of sets synced.
 */
final class SyncMemoryTest extends KernelTestCase
{
    private const BASE_URI = 'https://tcgcsv.com/tcgplayer/';

    /** Sets in the simulated catalog. */
    private const SET_COUNT = 40;

    /** Products per set. */
    private const PRODUCTS_PER_SET = 25;

    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
    }

    public function testIdentityMapDoesNotGrowWithTheNumberOfSets(): void
    {
        $game = static::getContainer()->get(GameRepository::class)->findOneByCode('onepiece');
        self::assertNotNull($game);

        $http = new MockHttpClient(function (string $method, string $url): MockResponse {
            if (str_ends_with($url, '/68/groups')) {
                $groups = [];
                for ($i = 0; $i < self::SET_COUNT; ++$i) {
                    $groups[] = ['groupId' => 40000 + $i, 'name' => 'Set '.$i, 'abbreviation' => 'S'.$i];
                }

                return new MockResponse(json_encode(['results' => $groups]));
            }

            if (str_ends_with($url, '/products')) {
                preg_match('#/(\d+)/products$#', $url, $m);
                $groupId = (int) ($m[1] ?? 0);
                $products = [];
                for ($i = 0; $i < self::PRODUCTS_PER_SET; ++$i) {
                    $productId = $groupId * 1000 + $i;
                    $products[] = 0 === $i % 2
                        ? [
                            'productId' => $productId,
                            'name' => 'Card '.$productId,
                            'extendedData' => [['name' => 'Number', 'value' => (string) $i]],
                        ]
                        : ['productId' => $productId, 'name' => 'Box '.$productId, 'extendedData' => []];
                }

                return new MockResponse(json_encode(['results' => $products]));
            }

            return new MockResponse(json_encode(['results' => []]));
        }, self::BASE_URI);

        $c = static::getContainer();
        $synchronizer = new CatalogSynchronizer(
            new TcgcsvClient($http, requestIntervalUs: 0),
            $this->em,
            $c->get(GameSetRepository::class),
            $c->get(SealedProductRepository::class),
            $c->get(CardRepository::class),
            new SqlDebugLogPruner(),
            new NullLogger(),
        );

        /** @var list<int> $managedAfterSet */
        $managedAfterSet = [];
        $summary = $synchronizer->sync($game, onProgress: function () use (&$managedAfterSet): void {
            $managedAfterSet[] = $this->em->getUnitOfWork()->size();
        });

        self::assertSame(self::SET_COUNT, $summary['groupsSeen']);
        self::assertSame(
            self::SET_COUNT * self::PRODUCTS_PER_SET,
            $summary['cardsUpserted'] + $summary['sealedUpserted'],
        );

        // The telling comparison: what Doctrine holds after the last set must
        // not be larger than after the first. Without the per-set clear() this
        // climbs by ~PRODUCTS_PER_SET every iteration.
        $first = $managedAfterSet[0];
        $last = end($managedAfterSet);
        self::assertLessThanOrEqual(
            $first + 5,
            $last,
            sprintf('managed entities grew from %d to %d across %d sets', $first, $last, self::SET_COUNT),
        );
        self::assertLessThan(self::PRODUCTS_PER_SET, $last, 'a synced set is released, not retained');
    }
}
