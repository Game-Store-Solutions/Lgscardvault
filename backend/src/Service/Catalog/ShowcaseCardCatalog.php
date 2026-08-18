<?php

namespace App\Service\Catalog;

/**
 * The cards the marketing surfaces show, per game.
 *
 * These are the most recognizable cards in each game we service — the ones a
 * collector identifies instantly — chosen so the landing page reads as a
 * deliberate display case rather than whatever happened to sync last. The list
 * is names only: art is always resolved from our own catalog, so nothing is
 * hardcoded to an external URL and a card we don't stock simply drops out.
 *
 * Order matters. The first entry that resolves becomes the game's tile card, and
 * the rest fill the hero background.
 *
 * Entries are matched as name prefixes, which keeps them robust across the two
 * naming conventions in the catalog: Scryfall's exact names for Magic
 * ("Ragavan, Nimble Pilferer") and TCGCSV's product names for everything else
 * ("Ahri - Nine-Tailed Fox", "Charizard (Holofoil)").
 */
final class ShowcaseCardCatalog
{
    /** @var array<string, list<string>> game code => card name prefixes */
    private const CARDS = [
        // Iconic Magic for the games reel, then format staples to fill the hero
        // and stand in if a printing's art 404s.
        'mtg' => [
            'Birds of Paradise',
            'Goblin Guide',
            'Dark Confidant',
            'Snapcaster Mage',
            'Serra Angel',
            'Lightning Bolt',
            'Ragavan',
            'Sheoldred',
            'The One Ring',
            'Jace, the Mind Sculptor',
            'Tarmogoyf',
            'Force of Will',
            'Liliana of the Veil',
        ],
        // Charizard leads; Umbreon (the "Moonbreon" alt art) is the modern grail.
        'pokemon' => [
            'Charizard',
            'Umbreon',
            'Pikachu',
            'Mewtwo',
            'Rayquaza',
            'Gengar',
            'Lugia',
            'Blastoise',
            'Venusaur',
            'Espeon',
            'Mew',
            'Gyarados',
        ],
        // Straw Hats first, then the Emperors — the game's chase hierarchy.
        'onepiece' => [
            'Monkey D. Luffy',
            'Roronoa Zoro',
            'Shanks',
            'Gol D. Roger',
            'Trafalgar Law',
            'Nami',
            'Boa Hancock',
            'Dracule Mihawk',
            'Portgas D. Ace',
            'Marshall D. Teach',
            'Sanji',
            'Yamato',
        ],
        // Signature heroes — the faces of Flesh and Blood's classes.
        'fab' => [
            'Prism',
            'Bravo',
            'Dorinthea',
            'Chane',
            'Katsu',
            'Viserai',
            'Kano',
            'Rhinar',
            'Lexi',
            'Ira',
            'Azalea',
            'Maxx',
        ],
        // Origins champions, led by the set's most sought-after signatures.
        'riftbound' => [
            'Ahri',
            'Jinx',
            'Yasuo',
            "Kai'Sa",
            'Lee Sin',
            'Teemo',
            'Viktor',
            'Leona',
            'Volibear',
            'Miss Fortune',
            'Sett',
            'Lux',
        ],
    ];

    /**
     * Curated name prefixes for a game, best first. Empty for games we have no
     * curation for yet — callers fall back to the newest catalog art.
     *
     * @return list<string>
     */
    public function forGame(string $gameCode): array
    {
        return self::CARDS[strtolower(trim($gameCode))] ?? [];
    }
}
