<?php

namespace App\Tests\Repository;

use App\Entity\Card;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\GameRepository;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * The landing page names the cards it wants ("Black Lotus") and we resolve them
 * against the catalog. Prefix matching is required for TCGCSV product names
 * ("Charizard (Holofoil)"), but on its own it shipped the wrong card to
 * production: "Black Lotus" resolved to "Black Lotus Lounge", a MagicCon plane
 * card that merely starts with the same words and was printed decades later.
 * These tests pin exact-match precedence and the prefix fallback that still
 * needs to work.
 */
final class ShowcaseCardResolutionTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CardRepository $cards;
    private Game $mtg;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = self::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->cards = $c->get(CardRepository::class);
        $this->mtg = $c->get(GameRepository::class)->findOneByCode(Game::CODE_MTG);
    }

    public function testExactNameWinsOverALongerNewerCardWithTheSamePrefix(): void
    {
        // The decoy is newer, so recency ordering alone would surface it.
        $lotus = $this->showcaseCard(910_001, 'Black Lotus', '1993-08-05');
        $this->showcaseCard(910_002, 'Black Lotus Lounge', '2023-10-20');

        $resolved = $this->cards->findShowcaseByNamesForGame($this->mtg, ['Black Lotus']);

        self::assertCount(1, $resolved);
        self::assertSame($lotus->getId()->toRfc4122(), $resolved[0]->getId()->toRfc4122());
        self::assertSame('Black Lotus', $resolved[0]->getName());
    }

    public function testPrefixMatchStillResolvesSuffixedProductNames(): void
    {
        // No exact "Sol Ring" exists here, so the prefix pass must still hit.
        $this->showcaseCard(910_003, 'Sol Ring (Retro Frame)', '2021-02-05');

        $resolved = $this->cards->findShowcaseByNamesForGame($this->mtg, ['Sol Ring']);

        self::assertCount(1, $resolved);
        self::assertSame('Sol Ring (Retro Frame)', $resolved[0]->getName());
    }

    public function testCuratedOrderIsPreservedAndCardsAreNotReused(): void
    {
        $this->showcaseCard(910_004, 'Lightning Bolt', '1993-08-05');
        $this->showcaseCard(910_005, 'Sheoldred, the Apocalypse', '2022-09-09');

        $resolved = $this->cards->findShowcaseByNamesForGame(
            $this->mtg,
            ['Sheoldred', 'Lightning Bolt'],
        );

        self::assertSame(
            ['Sheoldred, the Apocalypse', 'Lightning Bolt'],
            array_map(static fn (Card $card): string => $card->getName(), $resolved),
        );
    }

    public function testCardsWithoutArtAreSkipped(): void
    {
        $this->showcaseCard(910_006, 'Tarmogoyf', '2007-05-04', withArt: false);

        self::assertSame([], $this->cards->findShowcaseByNamesForGame($this->mtg, ['Tarmogoyf']));
    }

    /** A Magic card the showcase query can see: named, dated, and with art. */
    private function showcaseCard(int $seed, string $name, string $releasedAt, bool $withArt = true): Card
    {
        $card = (new CatalogFixtures($this->em))->card($seed, ['name' => $name]);
        $card->setGame($this->mtg);
        $card->setReleasedAt(new \DateTimeImmutable($releasedAt));
        if ($withArt) {
            $card->setImageUris([
                'small' => sprintf('https://example.test/%d_small.jpg', $seed),
                'normal' => sprintf('https://example.test/%d_normal.jpg', $seed),
            ]);
        }
        $this->em->flush();

        return $card;
    }
}
