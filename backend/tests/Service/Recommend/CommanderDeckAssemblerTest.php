<?php

namespace App\Tests\Service\Recommend;

use App\Entity\Card;
use App\Entity\Store;
use App\Service\Recommend\CommanderDeckAssembler;
use App\Service\Recommend\Intelligence\CommanderIntelligenceRefresher;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\CommanderIntelligenceFixtures;
use App\Tests\Support\FakeArchidektClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Deck construction guarantees.
 *
 * The engine can rank cards perfectly and still produce an unplayable deck, so
 * these tests are about the structural contract: exactly 100 legal cards,
 * singleton respected, a real mana base, and a list that actually reflects the
 * chosen strategy.
 */
final class CommanderDeckAssemblerTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $catalog;
    private CommanderIntelligenceFixtures $scenario;
    private FakeArchidektClient $archidekt;
    private CommanderDeckAssembler $assembler;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->catalog = new CatalogFixtures($this->em);
        $this->archidekt = $c->get(FakeArchidektClient::class);
        $this->archidekt->reset();
        $this->assembler = $c->get(CommanderDeckAssembler::class);
        $this->scenario = new CommanderIntelligenceFixtures(
            $this->em,
            $this->catalog,
            $this->archidekt,
            $c->get(CommanderIntelligenceRefresher::class),
        );
    }

    public function testBuildsExactlyOneHundredLegalCardsIncludingTheCommander(): void
    {
        [$store, $commander] = $this->deepStore();

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);

        $copies = array_sum(array_column($deck['cards'], 'quantity'));
        self::assertSame(99, $copies, 'the 99 plus the commander must make exactly 100');
        self::assertSame(100, $deck['filledSize']);
        self::assertSame(100, $deck['targetSize']);
        self::assertSame([], $this->structuralGaps($deck), 'a deep catalog should leave no structural gaps');
    }

    public function testSingletonIsEnforcedExceptForBasicLands(): void
    {
        [$store, $commander] = $this->deepStore();

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);

        $oracleIds = array_column(array_column($deck['cards'], 'card'), 'oracleId');
        self::assertSame(
            count($oracleIds),
            count(array_unique($oracleIds)),
            'each card must appear as a single row',
        );

        foreach ($deck['cards'] as $row) {
            if ($row['quantity'] > 1) {
                self::assertStringContainsString(
                    'Basic Land',
                    (string) $row['card']['typeLine'],
                    'only basic lands may be duplicated in a singleton format',
                );
            }
        }

        self::assertNotContains(
            (string) $commander->getOracleId(),
            $oracleIds,
            'the commander must not also occupy one of the 99',
        );
    }

    public function testBuildsARealManaBase(): void
    {
        [$store, $commander] = $this->deepStore();

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);

        $landTarget = $deck['structure']['targets']['lands'];
        self::assertGreaterThanOrEqual(30, $landTarget);
        self::assertSame(
            $landTarget,
            $deck['slots']['lands'],
            'the builder should hit the land target exactly, not overshoot or undershoot',
        );
    }

    public function testStrategyChangesTheResultingDeck(): void
    {
        [$store, $commander] = $this->deepStore();

        $tokens = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);
        $counters = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::COUNTERS_STRATEGY,
        ]);

        self::assertSame(CommanderIntelligenceFixtures::TOKENS_STRATEGY, $tokens['strategy']['id']);
        self::assertSame(CommanderIntelligenceFixtures::COUNTERS_STRATEGY, $counters['strategy']['id']);

        $tokenNames = $this->nonLandNames($tokens);
        $counterNames = $this->nonLandNames($counters);
        self::assertNotSame(
            $tokenNames,
            $counterNames,
            'picking a different strategy must produce a different deck',
        );

        // The strategy-defining cards should be present in the matching build.
        self::assertContains('Token Doubler Test', $tokenNames);
        self::assertContains('Counter Placer Test', $counterNames);
    }

    public function testStrategyPackageIsRepresentedInTheBuild(): void
    {
        [$store, $commander] = $this->deepStore();

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);

        $components = $deck['structure']['packageActual'];
        self::assertArrayHasKey('generator', $components);
        self::assertArrayHasKey('payoff', $components);
        self::assertGreaterThan(
            0,
            $components['payoff'],
            'a token deck with no payoff is a pile of creatures, not a deck',
        );
        self::assertGreaterThan(0, $components['generator']);
    }

    public function testIllegalCardsNeverEnterTheDeck(): void
    {
        [$store, $commander] = $this->deepStore();

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);
        $names = array_column(array_column($deck['cards'], 'card'), 'name');

        self::assertNotContains('Blue Interloper Test', $names, 'outside the color identity');
        self::assertNotContains('Banned Token Engine Test', $names, 'banned in Commander');
    }

    public function testEveryCardCarriesItsScoringExplanation(): void
    {
        [$store, $commander] = $this->deepStore();

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);

        foreach ($deck['cards'] as $row) {
            self::assertNotEmpty($row['reasons'], $row['card']['name'].' has no explanation');
            self::assertNotEmpty($row['scoreBreakdown'], $row['card']['name'].' has no score breakdown');
        }
    }

    public function testGapsAreReportedWhenTheCatalogCannotFillTheDeck(): void
    {
        $store = $this->catalog->store('deck-thin-catalog');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);

        $deck = $this->assembler->assemble($store, $commander, [
            'strategy' => CommanderIntelligenceFixtures::TOKENS_STRATEGY,
        ]);

        self::assertLessThan(100, $deck['filledSize']);
        self::assertNotEmpty($deck['gaps'], 'a deck that cannot be filled must say so rather than look complete');
    }

    /**
     * A store deep enough to actually build 100 cards: the scenario's meaningful
     * cards plus enough legal filler, and a basic land the builder can repeat.
     *
     * @return array{0: Store, 1: Card}
     */
    private function deepStore(): array
    {
        $store = $this->catalog->store('deck-deep-catalog');
        $cards = $this->scenario->cards();
        $commander = $cards[CommanderIntelligenceFixtures::COMMANDER];
        $this->scenario->stockAll($store, $cards);

        // Varied filler so role targets (ramp, draw, removal, protection) can be
        // satisfied without the builder having to reuse the same card.
        $templates = [
            ['Filler Ramp %d', 'Artifact', '{T}: Add {W}.', 2],
            ['Filler Draw %d', 'Instant', 'Draw a card.', 2],
            ['Filler Removal %d', 'Instant', 'Destroy target creature.', 3],
            ['Filler Protection %d', 'Instant', 'Target creature gains indestructible until end of turn.', 1],
            ['Filler Token %d', 'Creature — Soldier', 'When this creature enters, create a 1/1 white Soldier creature token.', 3],
            ['Filler Payoff %d', 'Enchantment', 'Whenever a creature you control enters, it deals 1 damage to each opponent.', 4],
            ['Filler Land %d', 'Land', '{T}: Add {R}.', null],
        ];

        $seed = 1000;
        foreach ($templates as [$nameTemplate, $typeLine, $oracleText, $cmc]) {
            for ($i = 0; $i < 12; ++$i) {
                $card = $this->catalog->card($seed++, [
                    'name' => sprintf($nameTemplate, $i),
                    'type_line' => $typeLine,
                    'oracle_text' => $oracleText,
                    'color_identity' => ['W'],
                    'cmc' => $cmc,
                    'legalities' => ['commander' => 'legal'],
                    'edhrec_rank' => 5000 + $seed,
                ]);
                $this->catalog->inventoryItem($store, $card, quantity: 2, priceCents: 150);
            }
        }
        $this->em->flush();

        $this->scenario->seedReferenceDecks($commander);

        return [$store, $commander];
    }

    /**
     * @param array<string, mixed> $deck
     *
     * @return list<string>
     */
    private function nonLandNames(array $deck): array
    {
        $names = [];
        foreach ($deck['cards'] as $row) {
            if (!str_contains(strtolower((string) $row['card']['typeLine']), 'land')) {
                $names[] = (string) $row['card']['name'];
            }
        }
        sort($names);

        return $names;
    }

    /**
     * Gaps that indicate the deck could not be built, as opposed to the
     * per-package "wants more of this" advice that is normal on any real deck.
     *
     * @param array<string, mixed> $deck
     *
     * @return list<string>
     */
    private function structuralGaps(array $deck): array
    {
        return array_values(array_filter(
            $deck['gaps'],
            static fn (string $gap): bool => str_starts_with($gap, 'Deck short'),
        ));
    }
}
