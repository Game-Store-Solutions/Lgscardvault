<?php

namespace App\Tests\Service\Catalog;

use App\Entity\Card;
use App\Entity\Game;
use App\Service\Catalog\CardNameIdentity;
use App\Service\Catalog\CatalogSearchRanker;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Uid\Uuid;

final class CatalogSearchRankerTest extends TestCase
{
    public function testExactAndWordMatchesBeatSubstringsAndPopularityBreaksTies(): void
    {
        $ranker = new CatalogSearchRanker();
        $consolation = $this->card(1, 'Consolation', 200);
        $solRing = $this->card(2, 'Sol Ring', 12);
        $solarBlaze = $this->card(3, 'Solar Blaze', 9000);

        $ranked = $ranker->rank([$consolation, $solarBlaze, $solRing], 'sol');

        self::assertSame(['Sol Ring', 'Solar Blaze', 'Consolation'], array_map(
            static fn (Card $card): string => $card->getName(),
            $ranked,
        ));
    }

    public function testNamePrefixBeatsALaterWordEvenIfLessPopular(): void
    {
        $ranker = new CatalogSearchRanker();
        $boltBend = $this->card(4, 'Bolt Bend', 8000);
        $lightningBolt = $this->card(5, 'Lightning Bolt', 18);

        $ranked = $ranker->rank([$boltBend, $lightningBolt], 'bolt');

        self::assertSame(['Bolt Bend', 'Lightning Bolt'], array_map(
            static fn (Card $card): string => $card->getName(),
            $ranked,
        ));
    }

    public function testNamePrefixBeatsAPopularLaterWordOnAShortQuery(): void
    {
        $ranker = new CatalogSearchRanker();
        $ashaya = $this->card(13, 'Ashaya, Soul of the Wild', 40);
        $solRing = $this->card(2, 'Sol Ring', 12);
        $solarBlaze = $this->card(3, 'Solar Blaze', 9000);

        $ranked = $ranker->rank([$ashaya, $solarBlaze, $solRing], 'so');

        self::assertSame(['Sol Ring', 'Solar Blaze', 'Ashaya, Soul of the Wild'], array_map(
            static fn (Card $card): string => $card->getName(),
            $ranked,
        ));
    }

    public function testShortQueriesStillRankLaterWordsAndSubstringsBelowPrefixes(): void
    {
        $ranker = new CatalogSearchRanker();
        $superSoldier = $this->card(8, 'Red Guardian, Super-Soldier', 9000);
        $dissolve = $this->card(9, 'Dissolve', 4000);
        $solRing = $this->card(2, 'Sol Ring', 12);
        $soldier = $this->card(10, 'Soldier', 8000);

        $ranked = $ranker->rank([$superSoldier, $dissolve, $solRing, $soldier], 'sol');

        self::assertSame(['Sol Ring', 'Soldier', 'Red Guardian, Super-Soldier', 'Dissolve'], array_map(
            static fn (Card $card): string => $card->getName(),
            $ranked,
        ));
    }

    public function testCollapsedWhitespaceAndPartialTokensStillHitTheFullName(): void
    {
        $ranker = new CatalogSearchRanker();
        $solRing = $this->card(2, 'Sol Ring', 12);
        $solemn = $this->card(11, 'Solemn Simulacrum', 400);

        $ranked = $ranker->rank([$solemn, $solRing], 'sol  ri');

        self::assertSame('Sol Ring', $ranked[0]->getName());
    }

    public function testOneEditOnALongerTokenStillRanksTheIntendedCard(): void
    {
        $ranker = new CatalogSearchRanker();
        $solRing = $this->card(2, 'Sol Ring', 12);
        $solemn = $this->card(11, 'Solemn Simulacrum', 400);

        $ranked = $ranker->rank([$solemn, $solRing], 'sol rng');

        self::assertSame('Sol Ring', $ranked[0]->getName());
    }

    public function testUniqueCardsKeepsTheFirstPrintingPerOracle(): void
    {
        $ranker = new CatalogSearchRanker();
        $oracle = Uuid::fromString('aaaaaaaa-bbbb-4ccc-8ddd-000000000001');
        $c21 = $this->card(6, 'Sol Ring', 12, $oracle);
        $cmm = $this->card(7, 'Sol Ring', 12, $oracle);

        $unique = $ranker->uniqueCards($ranker->rank([$cmm, $c21], 'sol ring'));

        self::assertCount(1, $unique);
        self::assertSame('Sol Ring', $unique[0]->getName());
    }

    public function testNonMagicSearchUsesPriceAsPopularityAndCollapsesByName(): void
    {
        $ranker = new CatalogSearchRanker();
        $pokemon = (new Game())->setCode('pokemon')->setName('Pokémon');
        $cheap = $this->pokemonCard(20, 'Pikachu', '0.25', $pokemon);
        $iconic = $this->pokemonCard(21, 'Pikachu', '40.00', $pokemon);
        $cousin = $this->pokemonCard(22, 'Pikachu V', '5.00', $pokemon);

        $ranked = $ranker->rank([$cousin, $cheap, $iconic], 'pika');

        self::assertSame('Pikachu', $ranked[0]->getName());
        $unique = $ranker->uniqueCards($ranked);
        self::assertCount(2, $unique);
        self::assertSame(['Pikachu', 'Pikachu V'], array_map(
            static fn (Card $card): string => $card->getName(),
            $unique,
        ));
    }

    public function testOnePieceVariantsCollapseToOneUniqueName(): void
    {
        $ranker = new CatalogSearchRanker();
        $game = (new Game())->setCode('onepiece')->setName('One Piece');
        $base = $this->pokemonCard(30, 'Shanks', '12.00', $game);
        $manga = $this->pokemonCard(31, 'Shanks (OP04) (Manga)', '80.00', $game);
        $gold = $this->pokemonCard(32, 'Shanks - OP09-004 (Gold)', '25.00', $game);

        $unique = $ranker->uniqueCards($ranker->rank([$base, $manga, $gold], 'shanks'));

        self::assertCount(1, $unique);
        self::assertSame('Shanks', CardNameIdentity::baseName($unique[0]->getName()));
    }

    private function card(int $seed, string $name, int $edhrecRank, ?Uuid $oracleId = null): Card
    {
        $hex = str_pad(dechex($seed), 8, '0', STR_PAD_LEFT);
        $card = new Card(Uuid::fromString(sprintf('%s-1111-4222-8333-%012d', $hex, $seed)));
        $card->setOracleId($oracleId ?? Uuid::fromString(sprintf('%s-5555-4666-8777-%012d', $hex, $seed)));
        $card->setName($name);
        $card->setEdhrecRank($edhrecRank);

        return $card;
    }

    private function pokemonCard(int $seed, string $name, string $usd, Game $game): Card
    {
        $card = $this->card($seed, $name, 0);
        $card->setEdhrecRank(null);
        $card->setGame($game);
        $card->setPrices(['usd' => $usd]);

        return $card;
    }
}
