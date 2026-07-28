<?php

namespace App\Tests\Service\Tcgcsv;

use App\Entity\CatalogSyncRun;
use App\Entity\SealedProduct;
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
 * TCGCSV catalog sync against a mocked mirror: groups become sets,
 * products split into cards (extendedData "Number" present) vs sealed
 * (absent), prices land on both, re-runs are idempotent, and MTG keeps
 * Scryfall as its singles source (cards skipped, sealed still synced).
 */
final class CatalogSynchronizerTest extends KernelTestCase
{
    /** Mirrors the scoped `tcgcsv.client` base URI from http_client.yaml. */
    private const BASE_URI = 'https://tcgcsv.com/tcgplayer/';

    private EntityManagerInterface $em;
    private GameRepository $games;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get(EntityManagerInterface::class);
        $this->games = $c->get(GameRepository::class);
    }

    /**
     * Routes mocked TCGCSV endpoints by URL so a synchronizer can be run
     * any number of times in one test (idempotency).
     *
     * @param array<string, array<int, mixed>> $byPath path suffix => results
     */
    private function synchronizer(array $byPath): CatalogSynchronizer
    {
        $http = new MockHttpClient(function (string $method, string $url) use ($byPath): MockResponse {
            foreach ($byPath as $suffix => $results) {
                if (str_ends_with($url, $suffix)) {
                    return new MockResponse(json_encode(['results' => $results]));
                }
            }

            return new MockResponse(json_encode(['results' => []]));
        }, self::BASE_URI);

        $c = static::getContainer();

        return new CatalogSynchronizer(
            new TcgcsvClient($http, requestIntervalUs: 0),
            $this->em,
            $c->get(GameSetRepository::class),
            $c->get(SealedProductRepository::class),
            $c->get(CardRepository::class),
            new SqlDebugLogPruner(),
            new NullLogger(),
        );
    }

    /** @return array<string, array<int, mixed>> */
    private function onePieceFixture(): array
    {
        return [
            '/68/groups' => [[
                'groupId' => 23766,
                'name' => 'Romance Dawn',
                'abbreviation' => 'OP01',
                'publishedOn' => '2022-12-02T00:00:00',
            ]],
            '/68/23766/products' => [
                [
                    'productId' => 450001,
                    'name' => 'Monkey.D.Luffy',
                    'imageUrl' => 'https://img.example/450001.jpg',
                    'url' => 'https://www.tcgplayer.com/product/450001',
                    'extendedData' => [
                        ['name' => 'Number', 'value' => 'OP01-003'],
                        ['name' => 'Rarity', 'value' => 'L'],
                        ['name' => 'CardType', 'value' => 'Leader'],
                        ['name' => 'Power', 'value' => '5000'],
                        ['name' => 'Description', 'value' => '[Activate: Main] Give this Leader +1000 power.'],
                    ],
                ],
                [
                    'productId' => 450002,
                    'name' => 'Romance Dawn Booster Box',
                    'imageUrl' => 'https://img.example/450002.jpg',
                    'url' => 'https://www.tcgplayer.com/product/450002',
                    'extendedData' => [],
                ],
            ],
            '/68/23766/prices' => [
                ['productId' => 450001, 'subTypeName' => 'Normal', 'marketPrice' => 2.5, 'lowPrice' => 1.0],
                ['productId' => 450001, 'subTypeName' => 'Foil', 'marketPrice' => 12.34, 'lowPrice' => 9.0],
                ['productId' => 450002, 'subTypeName' => 'Normal', 'marketPrice' => 89.99, 'lowPrice' => 74.5],
            ],
        ];
    }

    public function testSyncsSetsCardsAndSealedForNonMtgGame(): void
    {
        $game = $this->games->findOneByCode('onepiece');
        self::assertNotNull($game, 'games are seeded by the migration');

        $summary = $this->synchronizer($this->onePieceFixture())->sync($game);

        self::assertSame(1, $summary['groupsSeen']);
        self::assertSame(1, $summary['setsCreated']);
        self::assertSame(1, $summary['cardsUpserted']);
        self::assertSame(1, $summary['sealedUpserted']);

        // Set mirrors the TCGCSV group and preserves its id.
        $set = static::getContainer()->get(GameSetRepository::class)->findOneByTcgcsvGroupId(23766);
        self::assertNotNull($set);
        self::assertSame('Romance Dawn', $set->getName());
        self::assertSame('OP01', $set->getCode());
        self::assertSame('2022-12-02', $set->getReleaseDate()?->format('Y-m-d'));

        // The single became a Card with a deterministic id and TCGCSV prices.
        $card = static::getContainer()->get(CardRepository::class)
            ->find(CatalogSynchronizer::cardIdForProduct(450001));
        self::assertNotNull($card);
        self::assertSame('onepiece', $card->resolvedGameCode());
        self::assertSame('Monkey.D.Luffy', $card->getName());
        self::assertSame('OP01', $card->getSetCode());
        self::assertSame('OP01-003', $card->getCollectorNumber());
        self::assertSame('L', $card->getRarity());
        self::assertSame('Leader', $card->getTypeLine());
        self::assertSame(450001, $card->getTcgplayerProductId());
        self::assertSame(['usd' => '2.50', 'usd_foil' => '12.34'], $card->getPrices());
        self::assertNull($card->getScryfallData(), 'TCGCSV cards must never look Scryfall-sourced');

        // The box became a SealedProduct, not a Card.
        $sealed = static::getContainer()->get(SealedProductRepository::class)->findOneByTcgcsvProductId(450002);
        self::assertNotNull($sealed);
        self::assertSame('Romance Dawn Booster Box', $sealed->getName());
        self::assertSame(8999, $sealed->getMarketPriceCents());
        self::assertSame(7450, $sealed->getLowPriceCents());
        self::assertSame($set->getId(), $sealed->getGameSet()?->getId());
        self::assertNull(
            static::getContainer()->get(CardRepository::class)->find(CatalogSynchronizer::cardIdForProduct(450002)),
            'sealed products must not create card rows'
        );
    }

    public function testRerunIsIdempotentAndAppliesUpdates(): void
    {
        $game = $this->games->findOneByCode('onepiece');
        self::assertNotNull($game);

        $this->synchronizer($this->onePieceFixture())->sync($game);

        // Second pass: price moved, everything else identical.
        $fixture = $this->onePieceFixture();
        $fixture['/68/23766/prices'][2]['marketPrice'] = 99.99;
        $summary = $this->synchronizer($fixture)->sync($game);

        self::assertSame(0, $summary['setsCreated'], 'set matched on tcgcsv group id');
        self::assertSame(1, $summary['setsUpdated']);

        $sealedRepo = static::getContainer()->get(SealedProductRepository::class);
        self::assertCount(1, $sealedRepo->findBy(['tcgcsvProductId' => '450002']), 'no duplicate sealed row');
        self::assertSame(9999, $sealedRepo->findOneByTcgcsvProductId(450002)?->getMarketPriceCents());
        self::assertCount(
            1,
            static::getContainer()->get(CardRepository::class)->findBy(['tcgplayerProductId' => '450001']),
            'no duplicate card row'
        );
    }

    public function testMtgSyncSkipsCardsButSyncsSealed(): void
    {
        $game = $this->games->findOneByCode('mtg');
        self::assertNotNull($game);

        $summary = $this->synchronizer([
            '/1/groups' => [['groupId' => 24380, 'name' => 'Modern Horizons 3', 'abbreviation' => 'MH3']],
            '/1/24380/products' => [
                [
                    'productId' => 550001,
                    'name' => 'Flare of Denial',
                    'extendedData' => [['name' => 'Number', 'value' => '58'], ['name' => 'Rarity', 'value' => 'M']],
                ],
                [
                    'productId' => 550002,
                    'name' => 'Modern Horizons 3 Play Booster Box',
                    'extendedData' => [],
                ],
            ],
            '/1/24380/prices' => [
                ['productId' => 550002, 'subTypeName' => 'Normal', 'marketPrice' => 249.99, 'lowPrice' => 230.0],
            ],
        ])->sync($game);

        self::assertSame(0, $summary['cardsUpserted'], 'MTG singles stay Scryfall-sourced');
        self::assertSame(1, $summary['sealedUpserted']);
        self::assertNull(
            static::getContainer()->get(CardRepository::class)->find(CatalogSynchronizer::cardIdForProduct(550001)),
            'no Card row for the MTG single'
        );

        $sealed = static::getContainer()->get(SealedProductRepository::class)->findOneByTcgcsvProductId(550002);
        self::assertInstanceOf(SealedProduct::class, $sealed);
        self::assertSame('mtg', $sealed->getGame()?->getCode());
        self::assertSame(24999, $sealed->getMarketPriceCents());
    }

    public function testMaxGroupsBoundsASmokeRun(): void
    {
        $game = $this->games->findOneByCode('onepiece');
        self::assertNotNull($game);

        $fixture = $this->onePieceFixture();
        $fixture['/68/groups'][] = [
            'groupId' => 23767,
            'name' => 'Paramount War',
            'abbreviation' => 'OP02',
            'publishedOn' => '2023-03-10T00:00:00',
        ];

        $summary = $this->synchronizer($fixture)->sync($game, maxGroups: 1);

        self::assertSame(1, $summary['groupsSeen'], 'only the first set is fetched');
        self::assertNull(
            static::getContainer()->get(GameSetRepository::class)->findOneByTcgcsvGroupId(23767),
            'the bounded run never reaches the second set'
        );
    }

    public function testOneBadGroupDoesNotAbortTheWholeSync(): void
    {
        $game = $this->games->findOneByCode('onepiece');
        self::assertNotNull($game);

        // Two groups; the first one's product fetch 500s past its retries.
        $http = new MockHttpClient(function (string $method, string $url): MockResponse {
            if (str_ends_with($url, '/68/groups')) {
                return new MockResponse(json_encode(['results' => [
                    ['groupId' => 24001, 'name' => 'Broken Set', 'abbreviation' => 'BAD'],
                    ['groupId' => 23766, 'name' => 'Romance Dawn', 'abbreviation' => 'OP01'],
                ]]));
            }
            if (str_contains($url, '/24001/')) {
                return new MockResponse('nope', ['http_code' => 500]);
            }
            if (str_ends_with($url, '/68/23766/products')) {
                return new MockResponse(json_encode(['results' => [
                    ['productId' => 450002, 'name' => 'Romance Dawn Booster Box', 'extendedData' => []],
                ]]));
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

        $summary = $synchronizer->sync($game);

        self::assertSame(1, $summary['groupsFailed']);
        self::assertSame(1, $summary['groupsSeen'], 'the healthy set still synced');
        self::assertNotEmpty($summary['failures']);
        self::assertNotNull(
            $c->get(SealedProductRepository::class)->findOneByTcgcsvProductId(450002),
            'products from the healthy set landed despite the broken one'
        );
    }

    public function testRunnerRecordsFailedRunWhenMirrorErrors(): void
    {
        $http = new MockHttpClient(static fn (): MockResponse => new MockResponse('oops', ['http_code' => 500]), self::BASE_URI);
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
        $runner = new CatalogSyncRunner(
            $synchronizer,
            $this->games,
            $c->get(CatalogSyncRunRepository::class),
            $this->em,
            new NullLogger(),
        );

        $run = $runner->run('pokemon');

        self::assertSame(CatalogSyncRun::STATUS_FAILED, $run->getStatus());
        self::assertNotNull($run->getError());
        self::assertNotNull($run->getFinishedAt());

        $this->expectException(\InvalidArgumentException::class);
        $runner->run('not-a-game');
    }
}
