<?php

namespace App\Tests\Support;

use App\Entity\Card;
use App\Entity\Store;
use App\Service\Recommend\Intelligence\CommanderIntelligenceRefresher;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Builds a realistic commander scenario: one commander, two competing
 * strategies, a generic staple that appears in everything, and reference decks
 * that make the difference between them observable.
 *
 * Modelled on the Anim Pakal case from the design discussion, because it is the
 * situation the engine has to get right: the same commander supports both Tokens
 * and +1/+1 Counters, and picking one must produce a meaningfully different list
 * than picking the other.
 *
 * Deck padding uses a single basic land at high quantity. Reference decks are
 * validated as ~100 cards, and this keeps that true without creating a hundred
 * throwaway Card rows per deck.
 */
final class CommanderIntelligenceFixtures
{
    // Seeds are stable so tests can assert on specific cards by name.
    public const COMMANDER = 900;

    // Tokens package.
    public const TOKEN_MULTIPLIER = 910;   // "twice that many" — Mondrak-like
    public const TOKEN_PAYOFF = 911;       // ETB damage — Impact Tremors-like
    public const TOKEN_MULTIPLIER_TWO = 912;
    public const TOKEN_GENERATOR = 913;

    // +1/+1 counters package.
    public const COUNTER_GENERATOR = 920;
    public const PROLIFERATE = 921;

    // Appears in every deck regardless of strategy.
    public const GENERIC_STAPLE = 930;

    // Never legal for this commander.
    public const OFF_COLOR = 940;
    public const BANNED = 941;

    public const BASIC_LAND = 950;

    public const TOKENS_STRATEGY = 'tokens';
    public const COUNTERS_STRATEGY = 'plus-1-plus-1-counters';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly CatalogFixtures $catalog,
        private readonly FakeArchidektClient $archidekt,
        private readonly CommanderIntelligenceRefresher $refresher,
    ) {
    }

    /**
     * Create every card in the scenario and return them keyed by seed.
     *
     * @return array<int, Card>
     */
    public function cards(): array
    {
        $cards = [];

        $cards[self::COMMANDER] = $this->catalog->card(self::COMMANDER, [
            'name' => 'Anim Pakal Test',
            'type_line' => 'Legendary Creature — Human Soldier',
            'oracle_text' => 'Whenever Anim Pakal Test attacks, put a +1/+1 counter on it, then create X 1/1 colorless Gnome artifact creature tokens.',
            'color_identity' => ['R', 'W'],
            'mana_cost' => '{2}{R}{W}',
            'cmc' => 4,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 900,
        ]);

        $cards[self::TOKEN_MULTIPLIER] = $this->catalog->card(self::TOKEN_MULTIPLIER, [
            'name' => 'Token Doubler Test',
            'type_line' => 'Legendary Enchantment Creature — Phyrexian Praetor',
            'oracle_text' => 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
            'color_identity' => ['W'],
            'mana_cost' => '{3}{W}',
            'cmc' => 4,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 1200,
        ]);

        $cards[self::TOKEN_MULTIPLIER_TWO] = $this->catalog->card(self::TOKEN_MULTIPLIER_TWO, [
            'name' => 'Second Doubler Test',
            'type_line' => 'Enchantment',
            'oracle_text' => 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
            'color_identity' => ['W'],
            'mana_cost' => '{3}{W}',
            'cmc' => 4,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 1500,
        ]);

        $cards[self::TOKEN_PAYOFF] = $this->catalog->card(self::TOKEN_PAYOFF, [
            'name' => 'Tremor Payoff Test',
            'type_line' => 'Enchantment',
            'oracle_text' => 'Whenever a creature you control enters, Tremor Payoff Test deals 1 damage to each opponent.',
            'color_identity' => ['R'],
            'mana_cost' => '{1}{R}',
            'cmc' => 2,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 1800,
        ]);

        $cards[self::TOKEN_GENERATOR] = $this->catalog->card(self::TOKEN_GENERATOR, [
            'name' => 'Gnome Maker Test',
            'type_line' => 'Creature — Human Artificer',
            'oracle_text' => 'When Gnome Maker Test enters, create a 1/1 colorless Gnome artifact creature token.',
            'color_identity' => ['W'],
            'mana_cost' => '{2}{W}',
            'cmc' => 3,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 2400,
        ]);

        $cards[self::COUNTER_GENERATOR] = $this->catalog->card(self::COUNTER_GENERATOR, [
            'name' => 'Counter Placer Test',
            'type_line' => 'Creature — Human Soldier',
            'oracle_text' => 'At the beginning of combat on your turn, put a +1/+1 counter on target creature you control.',
            'color_identity' => ['W'],
            'mana_cost' => '{1}{W}',
            'cmc' => 2,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 1100,
        ]);

        $cards[self::PROLIFERATE] = $this->catalog->card(self::PROLIFERATE, [
            'name' => 'Proliferate Engine Test',
            'type_line' => 'Artifact',
            'oracle_text' => 'At the beginning of your end step, proliferate.',
            'keywords' => ['Proliferate'],
            'color_identity' => [],
            'mana_cost' => '{4}',
            'cmc' => 4,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 2600,
        ]);

        // Rank 1 makes this the most "popular" card available, which is exactly
        // what must not be enough to outrank a strategy card.
        $cards[self::GENERIC_STAPLE] = $this->catalog->card(self::GENERIC_STAPLE, [
            'name' => 'Generic Staple Test',
            'type_line' => 'Artifact',
            'oracle_text' => '{T}: Add {C}{C}.',
            'color_identity' => [],
            'mana_cost' => '{1}',
            'cmc' => 1,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 1,
        ]);

        $cards[self::OFF_COLOR] = $this->catalog->card(self::OFF_COLOR, [
            'name' => 'Blue Interloper Test',
            'type_line' => 'Creature — Merfolk',
            'oracle_text' => 'When Blue Interloper Test enters, create a 1/1 token. Twice that many of those tokens are created instead.',
            'color_identity' => ['U'],
            'mana_cost' => '{1}{U}',
            'cmc' => 2,
            'legalities' => ['commander' => 'legal'],
            'edhrec_rank' => 50,
        ]);

        $cards[self::BANNED] = $this->catalog->card(self::BANNED, [
            'name' => 'Banned Token Engine Test',
            'type_line' => 'Artifact',
            'oracle_text' => 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
            'color_identity' => [],
            'mana_cost' => '{1}',
            'cmc' => 1,
            'legalities' => ['commander' => 'banned'],
            'edhrec_rank' => 20,
        ]);

        $cards[self::BASIC_LAND] = $this->catalog->card(self::BASIC_LAND, [
            'name' => 'Plains Test',
            'type_line' => 'Basic Land — Plains',
            'oracle_text' => '{T}: Add {W}.',
            'color_identity' => ['W'],
            'legalities' => ['commander' => 'legal'],
        ]);

        $this->em->flush();

        return $cards;
    }

    /**
     * Register reference decks and run the aggregation the background worker
     * would normally do.
     *
     * Five decks tagged Tokens and five tagged +1/+1 Counters, with the generic
     * staple in all ten. That shape is what makes lift meaningful: the staple's
     * inclusion rate is identical in both scopes, so only the strategy-specific
     * cards can earn a strategy affinity bonus.
     *
     * @param int $tokenDecks   decks tagged Tokens
     * @param int $counterDecks decks tagged +1/+1 Counters
     */
    public function seedReferenceDecks(Card $commander, int $tokenDecks = 5, int $counterDecks = 5): void
    {
        $commanderOracle = CatalogFixtures::oracleIdFor(self::COMMANDER);
        $land = CatalogFixtures::oracleIdFor(self::BASIC_LAND);
        $staple = CatalogFixtures::oracleIdFor(self::GENERIC_STAPLE);

        $deckId = 1;

        for ($i = 0; $i < $tokenDecks; ++$i) {
            $cards = [
                CatalogFixtures::oracleIdFor(self::TOKEN_MULTIPLIER) => 1,
                CatalogFixtures::oracleIdFor(self::TOKEN_MULTIPLIER_TWO) => 1,
                CatalogFixtures::oracleIdFor(self::TOKEN_PAYOFF) => 1,
                CatalogFixtures::oracleIdFor(self::TOKEN_GENERATOR) => 1,
                $staple => 1,
            ];
            $cards[$land] = 99 - array_sum($cards);

            $this->archidekt->addDeck(
                deckId: $deckId++,
                commanderName: $commander->getName(),
                commanderOracleIds: [$commanderOracle],
                cards: $cards,
                tags: ['Tokens', 'Aggro'],
                viewCount: 10000 - $i,
                categories: [$land => 'Land'],
            );
        }

        for ($i = 0; $i < $counterDecks; ++$i) {
            $cards = [
                CatalogFixtures::oracleIdFor(self::COUNTER_GENERATOR) => 1,
                CatalogFixtures::oracleIdFor(self::PROLIFERATE) => 1,
                $staple => 1,
            ];
            $cards[$land] = 99 - array_sum($cards);

            $this->archidekt->addDeck(
                deckId: $deckId++,
                commanderName: $commander->getName(),
                commanderOracleIds: [$commanderOracle],
                cards: $cards,
                tags: ['+1/+1 Counters'],
                viewCount: 5000 - $i,
                categories: [$land => 'Land'],
            );
        }

        $this->refresher->refresh($commander);
    }

    /**
     * Put the whole scenario in stock so recommendations have inventory to link.
     *
     * @param array<int, Card> $cards
     */
    public function stockAll(Store $store, array $cards, int $quantity = 4, int $priceCents = 200): void
    {
        foreach ($cards as $seed => $card) {
            if (self::COMMANDER === $seed) {
                continue;
            }
            $this->catalog->inventoryItem($store, $card, quantity: $quantity, priceCents: $priceCents);
        }
        $this->em->flush();
    }
}
