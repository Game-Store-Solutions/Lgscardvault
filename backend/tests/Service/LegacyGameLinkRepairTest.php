<?php

namespace App\Tests\Service;

use App\Entity\Card;
use App\Entity\Game;
use App\Repository\InventoryItemRepository;
use App\Service\Inventory\LegacyGameLinkRepairer;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * The residue the screenshots showed: One Piece listings created before
 * games existed as data. Their card has no game row (= Magic by the legacy
 * rule) while their notes say "Game: One Piece Card Game" — so they sit in
 * the Magic workspace, inflate Magic's stats, and are invisible to One
 * Piece's. Scoping queries can never fix rows that are mislabeled in the
 * database; the repairer relabels them.
 */
final class LegacyGameLinkRepairTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function game(string $code): Game
    {
        $game = $this->em->getRepository(Game::class)->findOneBy(['code' => $code]);
        self::assertNotNull($game);

        return $game;
    }

    /** A card the old recovery path created: no game, no Scryfall identity. */
    private function legacyCard(string $name, string $setCode, string $collector): Card
    {
        $card = new Card(Uuid::v4());
        $card->setOracleId(Uuid::v4());
        $card->setName($name);
        $card->setSetCode($setCode);
        $card->setCollectorNumber($collector);
        $this->em->persist($card);
        $this->em->flush();

        return $card;
    }

    /** The real catalog card a TCGCSV sync would have created. */
    private function catalogCard(Game $game, string $name, string $setCode, string $collector): Card
    {
        $card = new Card(Uuid::v4());
        $card->setOracleId(Uuid::v4());
        $card->setGame($game);
        $card->setName($name);
        $card->setSetCode($setCode);
        $card->setCollectorNumber($collector);
        $card->setFinishes(['Normal', 'Foil']);
        $this->em->persist($card);
        $this->em->flush();

        return $card;
    }

    public function testLegacyListingsMoveOntoTheirGamesCatalogCards(): void
    {
        $store = $this->fixtures->store();
        $onepiece = $this->game('onepiece');

        // The screenshot scenario: a game-less duplicate holding the stock,
        // and the real catalog card sitting unsold beside it.
        $duplicate = $this->legacyCard('"Buddha" Sengoku', 'OP16', 'OP16-077');
        $catalog = $this->catalogCard($onepiece, '"Buddha" Sengoku', 'OP-16', 'OP16-077');
        $item = $this->fixtures->inventoryItem($store, $duplicate, 1);
        $item->setNotes("Manually recovered from CSV import row #3 in import #7\nGame: One Piece Card Game");
        $this->em->flush();

        $report = static::getContainer()->get(LegacyGameLinkRepairer::class)->repair();

        self::assertSame(1, $report['repointed']);
        $this->em->refresh($item);
        self::assertTrue($item->getCard()?->getId()->equals($catalog->getId()), 'the listing now points at the catalog card');
        self::assertSame('Normal', $item->getFinish(), "and speaks the game's own finish vocabulary");

        // The workspaces now agree: One Piece counts it, Magic does not.
        $repo = static::getContainer()->get(InventoryItemRepository::class);
        self::assertSame(1, $repo->statsForGame($store, 'onepiece')['listings']);
        self::assertSame(0, $repo->statsForGame($store, 'mtg')['listings']);
    }

    public function testRepointingMergesIntoAnExistingLineOfTheSamePrinting(): void
    {
        $store = $this->fixtures->store();
        $onepiece = $this->game('onepiece');

        $catalog = $this->catalogCard($onepiece, 'Trafalgar Law', 'OP-01', 'OP01-047');
        $already = $this->fixtures->inventoryItem($store, $catalog, 2, finish: 'Normal');

        $duplicate = $this->legacyCard('Trafalgar Law', 'Romance Dawn', 'OP01-047');
        $legacyItem = $this->fixtures->inventoryItem($store, $duplicate, 3);
        $legacyItem->setNotes('Game: One Piece');
        $this->em->flush();
        $legacyItemId = $legacyItem->getId();

        $report = static::getContainer()->get(LegacyGameLinkRepairer::class)->repair();

        self::assertSame(1, $report['merged']);
        $this->em->clear();
        $repo = static::getContainer()->get(InventoryItemRepository::class);
        self::assertNull($repo->find($legacyItemId), 'the duplicate line is gone');
        self::assertSame(5, $repo->find($already->getId())?->getQuantity(), 'its copies folded into the real line');
    }

    public function testSeveralDuplicatesOfOnePrintingCollapseWithoutColliding(): void
    {
        // The crash from the field: repeated failed-import rounds each left
        // their own game-less duplicate of the same printing. All of them
        // re-point to the same catalog line in one run — the merge check
        // must see the sibling repaired a moment earlier, not just the
        // database, or the flush hits the unique key.
        $store = $this->fixtures->store();
        $onepiece = $this->game('onepiece');
        $catalog = $this->catalogCard($onepiece, 'Roronoa Zoro', 'OP-01', 'OP01-025');

        foreach ([2, 3, 4] as $i => $quantity) {
            $duplicate = $this->legacyCard('Roronoa Zoro', 'Romance Dawn', 'OP01-025');
            $item = $this->fixtures->inventoryItem($store, $duplicate, $quantity);
            $item->setNotes('Game: One Piece Card Game');
        }
        $this->em->flush();

        $report = static::getContainer()->get(LegacyGameLinkRepairer::class)->repair();

        self::assertSame(1, $report['repointed'], 'one line claims the printing');
        self::assertSame(2, $report['merged'], 'the other two fold into it');

        $this->em->clear();
        $lines = static::getContainer()->get(InventoryItemRepository::class)
            ->findBy(['store' => $store->getId(), 'card' => $catalog->getId()]);
        self::assertCount(1, $lines);
        self::assertSame(9, $lines[0]->getQuantity(), 'all copies survive the collapse');
    }

    public function testAnUnsyncedGameTagsTheCardInPlace(): void
    {
        $store = $this->fixtures->store();

        // No Riftbound catalog here — but the listing can still live on the
        // right shelf instead of hiding among Magic.
        $card = $this->legacyCard('Jinx', 'OGN', 'OGN-042');
        $item = $this->fixtures->inventoryItem($store, $card, 1);
        $item->setNotes('Game: Riftbound: League of Legends');
        $this->em->flush();

        $report = static::getContainer()->get(LegacyGameLinkRepairer::class)->repair();

        self::assertSame(1, $report['retagged']);
        $this->em->refresh($card);
        self::assertSame('riftbound', $card->getGame()?->getCode());
    }

    public function testARealMagicCardIsNeverDraggedOutOfMagic(): void
    {
        $store = $this->fixtures->store();

        // The old recovery matched a Magic card by name. Re-tagging it would
        // corrupt every other listing of that card, so it is reported instead.
        $magic = $this->fixtures->card(9801, ['name' => 'Shared Namesake']);
        self::assertNotNull($magic->getScryfallData());
        $item = $this->fixtures->inventoryItem($store, $magic, 1);
        $item->setNotes('Game: One Piece Card Game');
        $this->em->flush();

        $report = static::getContainer()->get(LegacyGameLinkRepairer::class)->repair();

        self::assertSame(0, $report['retagged']);
        self::assertCount(1, $report['unresolved']);
        $this->em->refresh($magic);
        self::assertNull($magic->getGame());
    }

    public function testDryRunWritesNothing(): void
    {
        $store = $this->fixtures->store();
        $card = $this->legacyCard('Monkey.D.Luffy', 'OP-01', 'OP01-003');
        $item = $this->fixtures->inventoryItem($store, $card, 1);
        $item->setNotes('Game: One Piece Card Game');
        $this->em->flush();

        $report = static::getContainer()->get(LegacyGameLinkRepairer::class)->repair(dryRun: true);

        self::assertSame(1, $report['retagged'], 'the dry run still reports the work');
        $this->em->refresh($card);
        self::assertNull($card->getGame(), 'but writes none of it');
    }
}
