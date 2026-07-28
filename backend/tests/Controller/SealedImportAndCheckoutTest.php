<?php

namespace App\Tests\Controller;

use App\Entity\Game;
use App\Entity\SealedProduct;
use App\Entity\User;
use App\Message\ProcessCsvImportMessage;
use App\MessageHandler\ProcessCsvImportMessageHandler;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * The game-aware import wizard (validate/preview + a sealed import that
 * actually stocks sealed inventory) and sealed checkout end to end: add a
 * sealed listing to the cart, buy it, and get the stock back on cancel.
 */
final class SealedImportAndCheckoutTest extends WebTestCase
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

    private function authenticate(?User $user): void
    {
        $this->bearer = null === $user
            ? null
            : static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @return array<string, mixed> */
    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }
        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
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

    private function sealedProduct(string $gameCode, string $name, int $marketCents): SealedProduct
    {
        static $productId = 700000;
        $game = $this->em->getRepository(Game::class)->findOneBy(['code' => $gameCode]);
        self::assertNotNull($game);

        $product = new SealedProduct();
        $product->setGame($game);
        $product->setTcgcsvProductId(++$productId);
        $product->setName($name);
        $product->setMarketPriceCents($marketCents);
        $this->em->persist($product);
        $this->em->flush();

        return $product;
    }

    public function testSealedImportPreviewThenImportStocksInventory(): void
    {
        $store = $this->fixtures->store();
        $this->sealedProduct('onepiece', 'Romance Dawn Booster Box', 8999);
        $this->authenticate($store->getOwner());

        $csv = "Product Name,Qty,Price\nRomance Dawn Booster Box,4,94.99\nGhost Product Nobody Has,2,10.00\n";

        // Preview resolves against the catalog without writing anything.
        $preview = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports/preview",
            $csv,
            ['game' => 'onepiece', 'type' => 'sealed'],
        );
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('sealed', $preview['importType']);
        self::assertSame(2, $preview['totalRows']);
        self::assertSame(1, $preview['matchedRows']);
        self::assertSame(1, $preview['unmatchedRows']);
        self::assertSame(6, $preview['totalQuantity']);
        self::assertSame('matched', $preview['sample'][0]['match']);
        self::assertSame(9499, $preview['sample'][0]['priceCents']);
        self::assertSame('unmatched', $preview['sample'][1]['match']);
        self::assertCount(
            0,
            $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory"),
            'preview must not write inventory',
        );

        // The real import queues a job carrying the game + type.
        $this->authenticate($store->getOwner());
        $job = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports",
            $csv,
            ['game' => 'onepiece', 'type' => 'sealed'],
        );
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('onepiece', $job['gameCode']);
        self::assertSame('sealed', $job['importType']);

        // Run the worker inline: the matched row stocks, the ghost row fails.
        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        $lines = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory");
        self::assertCount(1, $lines);
        self::assertSame(4, $lines[0]['quantity']);
        self::assertSame(9499, $lines[0]['priceCents'], 'the sheet price wins over the market snapshot');
        self::assertSame('Romance Dawn Booster Box', $lines[0]['product']['name']);

        $detail = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/csv-imports/{$job['id']}");
        self::assertSame(1, $detail['importedRows']);
        self::assertSame(1, $detail['failedRows']);
    }

    public function testCardImportPreviewReportsGameAndMatches(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(7710, ['set' => 'mh3', 'collector_number' => '58']);
        $this->em->flush();
        $this->authenticate($store->getOwner());

        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."{$card->getName()},Magic,mh3,NM,No,rare,3,,58\n";

        $preview = $this->uploadCsv(
            "/api/stores/{$store->getSlug()}/csv-imports/preview",
            $csv,
            ['game' => 'mtg', 'type' => 'cards'],
        );

        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('cards', $preview['importType']);
        self::assertSame('mtg', $preview['gameCode']);
        self::assertSame(1, $preview['matchedRows']);
        self::assertSame($card->getName(), $preview['sample'][0]['matchedName']);
    }

    public function testSealedCheckoutSellsStockAndCancelRestocksIt(): void
    {
        $store = $this->fixtures->store();
        $product = $this->sealedProduct('mtg', 'Modern Horizons 3 Play Booster Box', 24999);

        // Staff stock two boxes.
        $this->authenticate($store->getOwner());
        $line = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", [
            'sealedProductId' => $product->getId(),
            'quantity' => 2,
            'priceCents' => 25999,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        // A customer adds one to the cart and checks out.
        $customer = $this->fixtures->user();
        $this->authenticate($customer);
        $cartLine = $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/sealed/{$line['id']}", ['quantity' => 1]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertTrue($cartLine['isSealed']);
        self::assertSame('Modern Horizons 3 Play Booster Box', $cartLine['sealedItem']['product']['name']);

        $cart = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/customer/cart");
        self::assertCount(1, $cart, 'sealed lines survive the cart listing query');

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/test-order", ['fulfillment' => 'pickup']);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(25999, $order['totalCents']);
        self::assertSame('Modern Horizons 3 Play Booster Box', $order['lines'][0]['cardName']);

        // Stock dropped by the purchased copy.
        $this->authenticate($store->getOwner());
        $after = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory");
        self::assertSame(1, $after[0]['quantity']);

        // Cancelling the order puts the box back on the shelf.
        $this->client->request(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            server: [
                'CONTENT_TYPE' => 'application/merge-patch+json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode(['status' => 'cancelled']),
        );
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $restocked = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sealed-inventory");
        self::assertSame(2, $restocked[0]['quantity'], 'cancelled sealed lines restock');
    }

    public function testSealedCartRejectsOutOfStockListing(): void
    {
        $store = $this->fixtures->store();
        $product = $this->sealedProduct('fab', 'Rosetta Booster Box', 12000);

        $this->authenticate($store->getOwner());
        $line = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sealed-inventory", [
            'sealedProductId' => $product->getId(), 'quantity' => 1,
        ]);
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sealed-inventory/{$line['id']}", ['quantity' => 0]);

        $this->authenticate($this->fixtures->user());
        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/sealed/{$line['id']}", ['quantity' => 1]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/sealed/99999", ['quantity' => 1]);
        self::assertSame(404, $this->client->getResponse()->getStatusCode());
    }
}
