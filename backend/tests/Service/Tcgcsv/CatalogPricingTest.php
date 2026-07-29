<?php

namespace App\Tests\Service\Tcgcsv;

use App\Entity\Game;
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
 * Prices from TCGCSV, whose subtype vocabulary is per game.
 *
 * Only "Normal" and "Foil" were read, and only the marketPrice field. That
 * left whole games' catalogs unpriced: Pokemon ships "Holofoil" / "Reverse
 * Holofoil" / "1st Edition Holofoil", Flesh and Blood "Rainbow Foil" /
 * "Cold Foil", and thinly traded printings often publish a spread with no
 * market price at all.
 */
final class CatalogPricingTest extends KernelTestCase
{
    private const BASE_URI = 'https://tcgcsv.com/tcgplayer/';

    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
    }

    /**
     * @param list<array<string, mixed>> $products
     * @param list<array<string, mixed>> $prices
     */
    private function sync(string $gameCode, int $categoryId, array $products, array $prices): void
    {
        $http = new MockHttpClient(function (string $method, string $url) use ($categoryId, $products, $prices): MockResponse {
            if (str_ends_with($url, sprintf('/%d/groups', $categoryId))) {
                return new MockResponse(json_encode(['results' => [
                    ['groupId' => 51000 + $categoryId, 'name' => 'Pricing Set', 'abbreviation' => 'PRC'],
                ]]));
            }
            if (str_ends_with($url, '/products')) {
                return new MockResponse(json_encode(['results' => $products]));
            }
            if (str_ends_with($url, '/prices')) {
                return new MockResponse(json_encode(['results' => $prices]));
            }

            return new MockResponse(json_encode(['results' => []]));
        }, self::BASE_URI);

        $c = static::getContainer();
        $game = static::getContainer()->get(GameRepository::class)->findOneByCode($gameCode);
        self::assertInstanceOf(Game::class, $game);

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

    public function testPokemonHolofoilSubtypesArePriced(): void
    {
        // A holo-only Pokemon card: no "Normal" row anywhere.
        $this->sync('pokemon', 3, [[
            'productId' => 710001,
            'name' => 'Charizard ex',
            'extendedData' => [['name' => 'Number', 'value' => '125']],
        ]], [
            ['productId' => 710001, 'subTypeName' => 'Holofoil', 'marketPrice' => 42.5],
            ['productId' => 710001, 'subTypeName' => 'Reverse Holofoil', 'marketPrice' => 12.0],
        ]);

        $card = static::getContainer()->get(CardRepository::class)
            ->find(CatalogSynchronizer::cardIdForProduct(710001));
        self::assertNotNull($card);
        self::assertSame(
            '42.50',
            $card->getPrices()['usd_foil'] ?? null,
            'a Holofoil subtype must be priced, not skipped for not being called "Foil"',
        );
    }

    public function testTheTreatmentNamesTheCatalogPublishesAreRecorded(): void
    {
        // The UI labels its finish picker from these. Storing them is what
        // lets a Pokemon card read "Normal / Holofoil" instead of Magic's
        // "Nonfoil / Foil".
        $this->sync('pokemon', 3, [[
            'productId' => 710002,
            'name' => 'Pikachu',
            'extendedData' => [['name' => 'Number', 'value' => '173']],
        ]], [
            ['productId' => 710002, 'subTypeName' => 'Normal', 'marketPrice' => 1.25],
            ['productId' => 710002, 'subTypeName' => 'Reverse Holofoil', 'marketPrice' => 4.0],
        ]);

        $card = static::getContainer()->get(CardRepository::class)
            ->find(CatalogSynchronizer::cardIdForProduct(710002));

        self::assertSame(['Normal', 'Reverse Holofoil'], $card?->getFinishes());
    }

    public function testFleshAndBloodSpecialtyFoilsArePriced(): void
    {
        $this->sync('fab', 62, [[
            'productId' => 720001,
            'name' => 'Command and Conquer',
            'extendedData' => [['name' => 'Number', 'value' => 'MON038']],
        ]], [
            ['productId' => 720001, 'subTypeName' => 'Normal', 'marketPrice' => 30.0],
            ['productId' => 720001, 'subTypeName' => 'Rainbow Foil', 'marketPrice' => 180.0],
        ]);

        $prices = static::getContainer()->get(CardRepository::class)
            ->find(CatalogSynchronizer::cardIdForProduct(720001))?->getPrices();

        self::assertSame('30.00', $prices['usd'] ?? null);
        self::assertSame('180.00', $prices['usd_foil'] ?? null, 'Rainbow Foil is a foil treatment');
    }

    public function testAPublishedSpreadIsUsedWhenThereIsNoMarketPrice(): void
    {
        // Thinly traded printings often have no marketPrice at all.
        $this->sync('riftbound', 89, [[
            'productId' => 730001,
            'name' => 'Jinx',
            'extendedData' => [['name' => 'Number', 'value' => 'OGN-042']],
        ]], [
            ['productId' => 730001, 'subTypeName' => 'Normal', 'marketPrice' => null, 'midPrice' => 3.75, 'lowPrice' => 2.0],
        ]);

        $prices = static::getContainer()->get(CardRepository::class)
            ->find(CatalogSynchronizer::cardIdForProduct(730001))?->getPrices();

        self::assertSame('3.75', $prices['usd'] ?? null, 'midPrice beats leaving the card unpriced');
    }

    public function testSealedFallsBackThroughTheSpreadToo(): void
    {
        $this->sync('onepiece', 68, [[
            'productId' => 740001,
            'name' => 'Romance Dawn Booster Box',
            'extendedData' => [],
        ]], [
            ['productId' => 740001, 'subTypeName' => 'Normal', 'marketPrice' => null, 'midPrice' => 94.5, 'lowPrice' => 80.0],
        ]);

        $sealed = static::getContainer()->get(SealedProductRepository::class)->findOneByTcgcsvProductId(740001);
        self::assertSame(9450, $sealed?->getMarketPriceCents());
        self::assertSame(8000, $sealed?->getLowPriceCents());
    }
}
