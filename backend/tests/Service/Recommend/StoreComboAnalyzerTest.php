<?php

namespace App\Tests\Service\Recommend;

use App\Entity\Card;
use App\Service\Recommend\StoreComboAnalyzer;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Uid\Uuid;

final class StoreComboAnalyzerTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private StoreComboAnalyzer $analyzer;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->analyzer = $c->get(StoreComboAnalyzer::class);
    }

    public function testBuildStockIndexAggregatesQuantityByOracleAcrossPrintings(): void
    {
        $store = $this->fixtures->store('combo-stock-aggregate');
        $cardA = $this->fixtures->card(901, ['name' => 'Sol Ring', 'type_line' => 'Artifact', 'color_identity' => []]);
        $cardB = $this->makePrinting($cardA->getOracleId(), 902, 'Sol Ring', 'c21', '261');
        $this->em->persist($cardB);
        $this->fixtures->inventoryItem($store, $cardA, quantity: 1, priceCents: 300);
        $this->fixtures->inventoryItem($store, $cardB, quantity: 2, priceCents: 250);
        $this->em->flush();

        $index = $this->analyzer->buildStockIndex($store);
        $oracleKey = strtolower((string) $cardA->getOracleId());

        self::assertSame(3, $index['byOracle'][$oracleKey]['quantity']);
        self::assertSame(250, $index['byOracle'][$oracleKey]['listing']->getPriceCents());
    }

    public function testRequiresInventoryQuantityNotJustCommanderSelection(): void
    {
        $store = $this->fixtures->store('combo-qty-store');
        $commander = $this->fixtures->card(910, [
            'name' => 'Atraxa Test',
            'type_line' => 'Legendary Creature',
            'color_identity' => ['W', 'U', 'B', 'G'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $buddy = $this->fixtures->card(911, [
            'name' => 'Proliferate Buddy',
            'type_line' => 'Creature',
            'color_identity' => ['U'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $this->fixtures->inventoryItem($store, $buddy, quantity: 1, priceCents: 200);
        $this->em->flush();

        $result = $this->analyzer->analyzeForCommander($store, $commander, limit: 5);
        $partial = null;
        foreach ($result['combos'] as $combo) {
            if ('test-combo-1' === $combo['id']) {
                $partial = $combo;
                break;
            }
        }
        self::assertNotNull($partial);
        self::assertFalse($partial['completeInStore']);

        $commanderPiece = null;
        foreach ($partial['cards'] as $piece) {
            if ('Atraxa Test' === $piece['name']) {
                $commanderPiece = $piece;
            }
        }
        self::assertNotNull($commanderPiece);
        self::assertFalse($commanderPiece['inStock'], 'commander must not count as stocked without inventory');
        self::assertNull($commanderPiece['inventoryItem']);
    }

    private function makePrinting(Uuid $oracleId, int $seed, string $name, string $set, string $number): Card
    {
        $hex = str_pad(dechex($seed), 8, '0', STR_PAD_LEFT);
        $card = new Card(Uuid::fromString(sprintf('%s-1111-4222-8333-%012d', $hex, $seed)));
        $card->setOracleId($oracleId);
        $card->setName($name);
        $card->setSetCode($set);
        $card->setCollectorNumber($number);
        $card->setColorIdentity([]);

        return $card;
    }
}
