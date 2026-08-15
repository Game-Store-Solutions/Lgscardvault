<?php

namespace App\Tests\Service\Catalog;

use App\Entity\Card;
use App\Service\Catalog\PaperPrinting;
use App\Service\Catalog\StockablePrintingPolicy;
use App\Service\Pricing\MarketPriceSource;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Uid\Uuid;

final class StockablePrintingPolicyTest extends TestCase
{
    public function testAlchemyCollectorNumberIsOnlineOnly(): void
    {
        $card = $this->card([
            'name' => 'A-Guide of Souls',
            'collector_number' => 'A-29',
            'set' => 'mh3',
            'games' => ['arena'],
            'digital' => true,
            'prices' => ['usd' => null],
        ]);

        self::assertStringContainsString('online', strtolower((string) PaperPrinting::onlineOnlyReason($card)));
        self::assertFalse(PaperPrinting::isPaper($card));
    }

    public function testPaperPrintingWithGamesIsAllowed(): void
    {
        $card = $this->card([
            'name' => 'Guide of Souls',
            'collector_number' => '20',
            'set' => 'mh3',
            'games' => ['paper', 'arena', 'mtgo'],
            'prices' => ['usd' => '2.50'],
        ]);

        self::assertNull(PaperPrinting::onlineOnlyReason($card));
        self::assertTrue(PaperPrinting::isPaper($card));
    }

    public function testZeroMarketPriceIsRejectedWithoutExplicitPrice(): void
    {
        $card = $this->card([
            'name' => 'Obscure Bulk',
            'collector_number' => '1',
            'set' => 'tst',
            'games' => ['paper'],
            'prices' => ['usd' => '0.00'],
        ]);

        $policy = new StockablePrintingPolicy($this->prices(null));
        $reason = $policy->rejectionReason($card, false);
        self::assertNotNull($reason);
        self::assertStringContainsString('$0', $reason);
    }

    public function testExplicitPriceAllowsUnpricedPaperCard(): void
    {
        $card = $this->card([
            'name' => 'Obscure Bulk',
            'collector_number' => '1',
            'set' => 'tst',
            'games' => ['paper'],
            'prices' => ['usd' => null],
        ]);

        $policy = new StockablePrintingPolicy($this->prices(null));

        self::assertNull($policy->rejectionReason($card, false, 150));
        self::assertNotNull($policy->rejectionReason($card, false, 0));
    }

    public function testOnlinePrintingRejectedEvenWithExplicitPrice(): void
    {
        $card = $this->card([
            'name' => 'A-Guide of Souls',
            'collector_number' => 'A-29',
            'games' => ['arena'],
            'digital' => true,
        ]);

        $policy = new StockablePrintingPolicy($this->prices(999));

        self::assertNotNull($policy->rejectionReason($card, false, 500));
    }

    private function prices(?int $cents): MarketPriceSource
    {
        return new class($cents) implements MarketPriceSource {
            public function __construct(private readonly ?int $cents)
            {
            }

            public function marketPriceCents(Card $card, bool $isFoil): ?int
            {
                return $this->cents;
            }
        };
    }

    /** @param array<string, mixed> $overrides */
    private function card(array $overrides): Card
    {
        $id = Uuid::v4();
        $card = new Card($id);
        $card->setName((string) ($overrides['name'] ?? 'Test'));
        $card->setSetCode((string) ($overrides['set'] ?? 'tst'));
        $card->setCollectorNumber((string) ($overrides['collector_number'] ?? '1'));
        $card->setGames(isset($overrides['games']) && is_array($overrides['games']) ? $overrides['games'] : null);
        $card->setPrices(isset($overrides['prices']) && is_array($overrides['prices']) ? $overrides['prices'] : null);
        $card->setScryfallData($overrides);

        return $card;
    }
}
