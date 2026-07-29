<?php

namespace App\Tests\Controller;

use App\Entity\Game;
use App\Entity\User;
use App\Message\ProcessCsvImportMessage;
use App\MessageHandler\ProcessCsvImportMessageHandler;
use App\Repository\CardRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use App\Service\Doctrine\SqlDebugLogPruner;
use App\Service\Tcgcsv\CatalogSynchronizer;
use App\Service\Tcgcsv\TcgcsvClient;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Log\NullLogger;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * The reported failure: a store syncs One Piece, downloads the One Piece
 * template, imports it unchanged — and every row fails with "no card named
 * X in the catalog" even though the card is plainly there.
 *
 * The cause was matching that required name AND set AND collector number to
 * all agree exactly. Outside Magic the collector number ("OP01-003") already
 * identifies the printing, and names/sets are written a dozen different ways.
 */
final class NonMtgImportMatchingTest extends WebTestCase
{
    private const BASE_URI = 'https://tcgcsv.com/tcgplayer/';

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

    /**
     * Mirrors a real One Piece sync: the set is published as "OP-01" /
     * "Romance Dawn [OP-01]", which is deliberately NOT what the template's
     * set column says ("Romance Dawn") — exactly the kind of drift that used
     * to fail every row.
     */
    private function syncOnePieceCatalog(): void
    {
        $http = new MockHttpClient(function (string $method, string $url): MockResponse {
            if (str_ends_with($url, '/68/groups')) {
                return new MockResponse(json_encode(['results' => [
                    ['groupId' => 23766, 'name' => 'Romance Dawn [OP-01]', 'abbreviation' => 'OP-01'],
                ]]));
            }
            if (str_ends_with($url, '/products')) {
                return new MockResponse(json_encode(['results' => [
                    [
                        'productId' => 450001,
                        'name' => 'Monkey.D.Luffy',
                        'extendedData' => [
                            ['name' => 'Number', 'value' => 'OP01-003'],
                            ['name' => 'Rarity', 'value' => 'Leader'],
                            [
                                'name' => 'Description',
                                'value' => 'Give this Leader -2000 power. <br>[Opponent&#39;s Turn] All of your [Portgas.D.Ace] cards gain +3000 power.',
                            ],
                        ],
                    ],
                    [
                        'productId' => 450047,
                        'name' => 'Trafalgar Law',
                        'extendedData' => [
                            ['name' => 'Number', 'value' => 'OP01-047'],
                            ['name' => 'Rarity', 'value' => 'Super Rare'],
                        ],
                    ],
                ]]));
            }

            return new MockResponse(json_encode(['results' => []]));
        }, self::BASE_URI);

        $c = static::getContainer();
        $game = $this->em->getRepository(Game::class)->findOneBy(['code' => 'onepiece']);
        self::assertNotNull($game);

        (new CatalogSynchronizer(
            new TcgcsvClient($http, requestIntervalUs: 0),
            $this->em,
            $c->get(GameSetRepository::class),
            $c->get(SealedProductRepository::class),
            $c->get(CardRepository::class),
            new SqlDebugLogPruner(),
            new NullLogger(),
        ))->sync($game);
    }

    /** @return array<string, mixed> */
    private function uploadCsv(string $url, string $csv, array $params): array
    {
        $path = tempnam(sys_get_temp_dir(), 'import').'.csv';
        file_put_contents($path, $csv);
        $this->client->request(
            'POST',
            $url,
            parameters: $params,
            files: ['file' => new UploadedFile($path, 'sheet.csv', 'text/csv', null, true)],
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
        );
        $raw = $this->client->getResponse()->getContent();
        @unlink($path);

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
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

    public function testDownloadedTemplateImportsCleanlyAfterASync(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        // The exact file the wizard hands out, imported unchanged.
        $this->client->request('GET', '/api/catalog/games/onepiece/import-template');
        $template = (string) $this->client->getResponse()->getContent();
        self::assertStringContainsString('Monkey.D.Luffy', $template);

        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $template,
            ['game' => 'onepiece', 'type' => 'cards'],
        );
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        $detail = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}");
        self::assertSame(
            2,
            $detail['importedRows'],
            'both template rows import: '.json_encode(array_column($detail['rows'] ?? [], 'error')),
        );
        self::assertSame(0, $detail['failedRows']);

        // And they landed as real listings on this store.
        $inventory = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=onepiece");
        $names = array_column(array_column($inventory['member'] ?? $inventory, 'card'), 'name');
        sort($names);
        self::assertSame(['Monkey.D.Luffy', 'Trafalgar Law'], $names);
    }

    public function testTheTemplateIsBuiltFromTheStoresOwnCatalog(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        $this->client->request('GET', '/api/catalog/games/onepiece/import-template');
        $template = (string) $this->client->getResponse()->getContent();

        // Rows are the cards that were actually synced — not invented ones
        // that would fail for a store whose catalog differs.
        self::assertStringContainsString('Monkey.D.Luffy', $template);
        self::assertStringContainsString('OP01-003', $template);
        self::assertStringContainsString('OP-01', $template, "the sheet carries the catalog's own set code");
    }

    public function testAnUnsyncedGameStillGetsAShapeToCopy(): void
    {
        $store = $this->fixtures->store();
        $this->authenticate($store->getOwner());

        // Riftbound has nothing synced here; the template falls back to
        // curated examples so the columns are still demonstrated.
        $this->client->request('GET', '/api/catalog/games/riftbound/import-template');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $template = (string) $this->client->getResponse()->getContent();
        self::assertStringContainsString('collectorNumber', $template);
        self::assertGreaterThanOrEqual(2, count(array_filter(explode("\n", trim($template)))));
    }

    public function testRowsResolveDespiteSetAndPunctuationDrift(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        // Row 1: set column disagrees with the catalog entirely — the
        //        collector number still identifies the card.
        // Row 2: no collector number, and the name is spaced differently.
        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."Monkey.D.Luffy,One Piece,Whatever Set Name,NM,No,Leader,2,,OP01-003\n"
            ."Trafalgar  Law,One Piece,,NM,No,Super Rare,1,,\n";

        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $csv,
            ['game' => 'onepiece', 'type' => 'cards'],
        );
        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        $detail = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}");
        self::assertSame(2, $detail['importedRows'], 'set drift and spacing must not fail a row');
    }

    public function testAGenuinelyUnknownCardExplainsWhatTheCatalogHas(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."Trafalgar Law (Parallel),One Piece,Romance Dawn,NM,No,SR,1,,OP01-999\n";

        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $csv,
            ['game' => 'onepiece', 'type' => 'cards'],
        );
        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        $detail = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}");
        self::assertSame(1, $detail['failedRows']);

        // The error names the near-miss the catalog holds, instead of the
        // dead-end "run a catalog sync" advice when a sync clearly ran.
        $error = (string) ($detail['rows'][0]['error'] ?? '');
        self::assertStringContainsString('Trafalgar Law', $error);
        self::assertStringContainsString('OP01-047', $error);
    }

    public function testASheetThatNamesTheTreatmentStocksThatTreatment(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        // A foil column carrying the treatment rather than Yes/No. This used
        // to parse as NOT foil — "holofoil" is not the word "foil" — and the
        // listing landed as a plain printing at the plain price.
        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."Monkey.D.Luffy,One Piece,Romance Dawn,NM,Parallel Foil,Leader,1,,OP01-003\n";

        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $csv,
            ['game' => 'onepiece', 'type' => 'cards'],
        );
        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        $inventory = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=onepiece");
        $lines = $inventory['member'] ?? $inventory;
        self::assertCount(1, $lines);
        self::assertSame('Parallel Foil', $lines[0]['finish']);
        self::assertTrue($lines[0]['isFoil']);
    }

    public function testAYesNoSheetGetsTheGamesOwnWordForThePrinting(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."Trafalgar Law,One Piece,Romance Dawn,NM,No,Super Rare,1,,OP01-047\n";

        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $csv,
            ['game' => 'onepiece', 'type' => 'cards'],
        );
        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        $inventory = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=onepiece");
        $lines = $inventory['member'] ?? $inventory;
        self::assertSame('Normal', $lines[0]['finish'], 'One Piece calls its plain printing "Normal"');
    }

    public function testRecoveryIsScopedToTheImportsOwnGame(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $magicCard = $this->fixtures->card(9901, ['name' => 'Innocent Bystander']);
        $this->authenticate($store->getOwner());

        // A row that cannot resolve: wrong collector, name not in catalog.
        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."Nonexistent Pirate,One Piece,Romance Dawn,NM,No,Rare,1,,OP01-999\n";
        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $csv,
            ['game' => 'onepiece', 'type' => 'cards'],
        );
        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        // The failed-row preview answers from the One Piece catalog only —
        // never the Scryfall cascade that used to "recover" these rows onto
        // Magic-shaped, game-less cards.
        $preview = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}/failed/preview");
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertCount(1, $preview['results']);
        self::assertStringContainsString('One Piece', (string) ($preview['results'][0]['error'] ?? ''));

        // Manual recovery refuses a card from another game outright.
        $this->client->request(
            'POST',
            "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}/rows/0/manual-import",
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
            content: json_encode(['cardId' => (string) $magicCard->getId(), 'quantity' => 1]),
        );
        self::assertSame(422, $this->client->getResponse()->getStatusCode(), 'a Magic card cannot recover a One Piece row');

        // The right game's card works.
        $opCardId = (string) CatalogSynchronizer::cardIdForProduct(450047);
        $this->client->request(
            'POST',
            "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}/rows/0/manual-import",
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
            content: json_encode(['cardId' => $opCardId, 'quantity' => 1]),
        );
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $inventory = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=onepiece");
        $names = array_column(array_column($inventory['member'] ?? $inventory, 'card'), 'name');
        self::assertContains('Trafalgar Law', $names, 'the recovered listing lives in its own game');
    }

    public function testCatalogSearchPayloadCarriesGameCode(): void
    {
        $store = $this->fixtures->store();
        $this->syncOnePieceCatalog();
        $this->authenticate($store->getOwner());

        // The add panel picks finish vocabulary and labels from gameCode;
        // when this key was missing every catalog result read as Magic and a
        // Pokemon card got listed as "Nonfoil".
        $results = $this->jsonRequest('GET', '/api/catalog/search?q=Trafalgar+Law&game=onepiece');
        self::assertNotEmpty($results);
        self::assertSame('onepiece', $results[0]['gameCode'] ?? '(ABSENT)');
    }

    public function testSyncedCardTextHasNoHtmlTags(): void
    {
        $this->syncOnePieceCatalog();

        $card = static::getContainer()->get(CardRepository::class)
            ->find(CatalogSynchronizer::cardIdForProduct(450001));
        self::assertNotNull($card);

        $text = (string) $card->getOracleText();
        self::assertStringNotContainsString('<br>', $text, 'rules text must not carry raw HTML');
        self::assertStringNotContainsString('&#39;', $text, 'entities are decoded');
        self::assertStringContainsString("power.\n[Opponent's Turn]", $text, 'the line break survives as a newline');
    }
}
