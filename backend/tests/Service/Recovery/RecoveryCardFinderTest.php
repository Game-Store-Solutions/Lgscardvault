<?php

namespace App\Tests\Service\Recovery;

use App\Entity\Card;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\GameRepository;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\StockablePrintingPolicy;
use App\Service\MTGJson\MTGJsonClient;
use App\Service\Pricing\MarketPriceSource;
use App\Service\Recovery\RecoveryCardFinder;
use App\Service\Recovery\RecoveryQuery;
use App\Service\Scryfall\ScryfallClient;
use App\Tests\Support\CatalogFixtures;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * The recovery ladder: given a broken CSV row, keep dropping the row's own
 * filters until a real printing surfaces, and say what had to be dropped.
 *
 * Scryfall and MTGJSON are mocked throughout, so these tests pin the ladder's
 * own logic rather than the catalog's contents, and never touch the network.
 */
final class RecoveryCardFinderTest extends KernelTestCase
{
    private CatalogFixtures $fixtures;
    private CardRepository $cards;
    private Game $mtg;
    private ScryfallClient $scryfall;
    private RecoveryCardFinder $finder;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = self::getContainer();
        $this->fixtures = new CatalogFixtures($c->get('doctrine')->getManager());
        $this->cards = $c->get(CardRepository::class);
        $this->mtg = $c->get(GameRepository::class)->findOneByCode(Game::CODE_MTG);

        // A resolver whose remote legs can never fire, so the cascade inside
        // each rung stays local and deterministic.
        $this->scryfall = $this->createMock(ScryfallClient::class);
        $this->scryfall->method('searchRemoteAndUpsert')->willReturn([]);
        $this->scryfall->method('fetchCollectionBySetCollectors')->willReturn([]);
        $resolver = new CatalogCardResolver(
            $this->cards,
            $this->createMock(MTGJsonClient::class),
            $this->scryfall,
        );

        $this->finder = new RecoveryCardFinder(
            $this->cards,
            $this->scryfall,
            $resolver,
            new StockablePrintingPolicy($this->storedPrices()),
        );
    }

    private function paperCard(int $seed, array $overrides): Card
    {
        return $this->fixtures->card($seed, array_merge([
            'games' => ['paper', 'arena', 'mtgo'],
            'prices' => ['usd' => '2.50'],
        ], $overrides));
    }

    private function digitalCard(int $seed, array $overrides): Card
    {
        return $this->fixtures->card($seed, array_merge([
            'games' => ['arena'],
            'digital' => true,
            'prices' => ['usd' => null],
        ], $overrides));
    }

    public function testAlchemyRowFindsThePaperPrintingAndExplainsTheDigitalOne(): void
    {
        $this->paperCard(20, ['name' => 'Guide of Souls', 'set' => 'mh3', 'collector_number' => '20']);
        $this->digitalCard(29, ['name' => 'A-Guide of Souls', 'set' => 'mh3', 'collector_number' => 'A-29']);

        // Exactly what the failed row carries.
        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'A-Guide of Souls', 'mh3', 'a-29'));

        self::assertCount(1, $result->items);
        self::assertSame('Guide of Souls', $result->items[0]->getName());
        self::assertContains(RecoveryCardFinder::RELAXED_ALCHEMY_NAME, $result->relaxed);
        self::assertContains(RecoveryCardFinder::RELAXED_COLLECTOR, $result->relaxed);

        // The digital printing is reported, not silently swallowed.
        self::assertCount(1, $result->rejected);
        self::assertSame('A-Guide of Souls', $result->rejected[0]['card']->getName());
        self::assertNotSame('', $result->rejected[0]['reason']);
    }

    public function testWrongCollectorNumberIsDroppedToFindThePrinting(): void
    {
        $this->paperCard(1, ['name' => 'Lightning Bolt', 'set' => 'clb', 'collector_number' => '187']);

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Lightning Bolt', 'clb', '999'));

        self::assertCount(1, $result->items);
        self::assertSame('187', $result->items[0]->getCollectorNumber());
        self::assertContains(RecoveryCardFinder::RELAXED_COLLECTOR, $result->relaxed);
    }

    public function testUnknownSetCodeIsDroppedToFindThePrinting(): void
    {
        $this->paperCard(2, ['name' => 'Counterspell', 'set' => 'mh2', 'collector_number' => '267']);

        // The sheet named a set this printing is not in.
        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Counterspell', 'zzz', ''));

        self::assertCount(1, $result->items);
        self::assertSame('Counterspell', $result->items[0]->getName());
        self::assertContains(RecoveryCardFinder::RELAXED_SET, $result->relaxed);
    }

    public function testExactRowNeedsNoRelaxation(): void
    {
        $this->paperCard(3, ['name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263']);

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Sol Ring', 'c21', '263'));

        self::assertCount(1, $result->items);
        self::assertSame([], $result->relaxed);
    }

    public function testFuzzyNameIsTheLastRung(): void
    {
        $bolt = $this->paperCard(4, ['name' => 'Lightning Bolt', 'set' => 'lea', 'collector_number' => '161']);

        // Nothing local matches the typo, so Scryfall's fuzzy matcher answers.
        $this->scryfall->method('fetchByFuzzyName')->willReturn($bolt);

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Lighming Bolr', '', ''));

        self::assertCount(1, $result->items);
        self::assertSame('Lightning Bolt', $result->items[0]->getName());
        self::assertContains(RecoveryCardFinder::RELAXED_FUZZY, $result->relaxed);
    }

    public function testOnlyDigitalMatchesReturnNoItemsButAReason(): void
    {
        $this->digitalCard(30, ['name' => 'Vessel of the All-Consuming', 'set' => 'y22', 'collector_number' => 'A-12']);

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Vessel of the All-Consuming', 'y22', 'A-12'));

        self::assertSame([], $result->items);
        self::assertCount(1, $result->rejected);
        self::assertStringContainsString('paper', strtolower($result->rejected[0]['reason']));
    }

    public function testPaperPrintingsOfListsSiblingsWithoutTheCardItself(): void
    {
        $oracle = '11112222-3333-4444-5555-666677778888';
        $first = $this->paperCard(41, [
            'name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263', 'oracle_id' => $oracle,
        ]);
        $this->paperCard(42, [
            'name' => 'Sol Ring', 'set' => 'lea', 'collector_number' => '270', 'oracle_id' => $oracle,
        ]);
        $this->digitalCard(43, [
            'name' => 'Sol Ring', 'set' => 'ymid', 'collector_number' => 'A-9', 'oracle_id' => $oracle,
        ]);
        $this->paperCard(44, [
            'name' => 'Sol Ring', 'set' => 'sld', 'collector_number' => '1', 'oracle_id' => $oracle,
            'prices' => ['usd' => '0.00'],
        ]);

        $siblings = $this->finder->paperPrintingsOf($first);

        self::assertCount(1, $siblings);
        self::assertSame('lea', $siblings[0]->getSetCode());
    }

    public function testBrowsePrintingsReturnsEverySetAndIgnoresTheSheetFilter(): void
    {
        $this->paperCard(61, [
            'name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263',
        ]);
        $this->paperCard(62, [
            'name' => 'Sol Ring', 'set' => 'lea', 'collector_number' => '270',
        ]);

        $result = $this->finder->browsePrintings(new RecoveryQuery($this->mtg, 'Sol Ring', 'c21', '263'));

        $sets = array_map(static fn (Card $card): string => $card->getSetCode(), $result->items);
        sort($sets);
        self::assertSame(['c21', 'lea'], $sets);
        self::assertSame([], $result->relaxed);
    }

    public function testUnpricedPaperPrintingIsRejectedNotOffered(): void
    {
        $this->paperCard(50, [
            'name' => 'Bulk Rare',
            'set' => 'mh3',
            'collector_number' => '1',
            'prices' => ['usd' => '0.00'],
        ]);

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Bulk Rare', 'mh3', '1'));

        self::assertSame([], $result->items);
        self::assertCount(1, $result->rejected);
        self::assertStringContainsString('$0', $result->rejected[0]['reason']);
    }

    public function testUnpricedExactHitFallsThroughToAPricedPrinting(): void
    {
        $this->paperCard(51, [
            'name' => 'Guide of Souls',
            'set' => 'mh3',
            'collector_number' => '20',
            'prices' => ['usd' => '0.00'],
        ]);
        $this->paperCard(52, [
            'name' => 'Guide of Souls',
            'set' => 'mh3',
            'collector_number' => '21',
            'prices' => ['usd' => '3.00'],
        ]);

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'Guide of Souls', 'mh3', '20'));

        self::assertCount(1, $result->items);
        self::assertSame('21', $result->items[0]->getCollectorNumber());
        self::assertContains(RecoveryCardFinder::RELAXED_COLLECTOR, $result->relaxed);
    }

    public function testFuzzyUsesTheNormalizedAlchemyName(): void
    {
        $paper = $this->paperCard(53, [
            'name' => 'Guide of Souls',
            'set' => 'mh3',
            'collector_number' => '20',
        ]);

        $this->scryfall->expects($this->atLeastOnce())
            ->method('fetchByFuzzyName')
            ->willReturnCallback(function (string $name, ?string $set = null) use ($paper): ?Card {
                self::assertSame('Gude of Souls', $name);
                self::assertFalse(str_starts_with($name, 'A-'));

                return 'mh3' === $set ? $paper : null;
            });

        $result = $this->finder->find(new RecoveryQuery($this->mtg, 'A-Gude of Souls', 'mh3', 'A-29'));

        self::assertCount(1, $result->items);
        self::assertSame('Guide of Souls', $result->items[0]->getName());
        self::assertContains(RecoveryCardFinder::RELAXED_FUZZY, $result->relaxed);
    }

    private function storedPrices(): MarketPriceSource
    {
        return new class implements MarketPriceSource {
            public function marketPriceCents(Card $card, bool $isFoil): ?int
            {
                return StockablePrintingPolicy::storedPriceCents($card, $isFoil);
            }
        };
    }
}
