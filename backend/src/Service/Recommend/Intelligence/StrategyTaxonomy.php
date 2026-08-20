<?php

namespace App\Service\Recommend\Intelligence;

/**
 * Canonical strategy/archetype vocabulary, keyed by slug.
 *
 * Slugs deliberately match the community theme vocabulary used by reference
 * deck providers (`tokens`, `plus-1-plus-1-counters`, `aristocrats`, ...) so a
 * provider's own tags normalize onto our taxonomy without a translation layer
 * per provider. `aliases` absorbs the spelling variants providers actually
 * emit ("+1/+1 Counters", "Counters Matter", "counters").
 *
 * This is the vocabulary; StrategyCatalog still owns per-card role rules and
 * ThemeTokenizer still owns tag extraction. Nothing here duplicates those.
 */
final class StrategyTaxonomy
{
    /** Package component roles used for synergy-package completion. */
    public const COMPONENT_GENERATOR = 'generator';
    public const COMPONENT_MULTIPLIER = 'multiplier';
    public const COMPONENT_PAYOFF = 'payoff';
    public const COMPONENT_ENABLER = 'enabler';

    public const FALLBACK_ID = 'staples';

    /**
     * @var array<string, array{
     *   label: string,
     *   description: string,
     *   aliases: list<string>,
     *   tags: list<string>,
     *   needles: list<string>,
     *   related: list<string>,
     *   package: array<string, array{label: string, needles: list<string>, target: int}>,
     *   structure: array<string, int>
     * }>
     */
    private const THEMES = [
        'tokens' => [
            'label' => 'Tokens',
            'description' => 'Flood the board with token creatures, multiply them, then convert the width into damage.',
            'aliases' => ['tokens', 'token', 'go wide', 'go-wide', 'weenies', 'populate', 'swarm'],
            'tags' => ['tokens', 'go_wide', 'etb'],
            'needles' => ['create a token', 'create two', 'create three', 'create x', 'populate', 'token creature'],
            'related' => ['plus-1-plus-1-counters', 'aristocrats', 'aggro', 'anthems'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Token generator',
                    'needles' => ['create a token', 'create two', 'create three', 'create x', 'create a 1/1', 'populate'],
                    'target' => 12,
                ],
                self::COMPONENT_MULTIPLIER => [
                    'label' => 'Token multiplier',
                    'needles' => ['creates one or more tokens', 'twice that many', 'double', 'that many plus'],
                    'target' => 3,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Token payoff',
                    'needles' => ['creatures you control get', 'other creatures you control', 'for each creature', 'whenever a creature you control enters', 'deals 1 damage to each opponent', 'attacking creatures'],
                    'target' => 8,
                ],
            ],
            // Wiping the board is counterproductive when we are the wide deck.
            'structure' => ['board_wipe' => 1, 'lands' => 35],
        ],
        'plus-1-plus-1-counters' => [
            'label' => '+1/+1 Counters',
            'description' => 'Accumulate +1/+1 counters, multiply and proliferate them, then cash them in.',
            'aliases' => ['+1/+1 counters', 'plus 1 plus 1 counters', 'counters matter', 'counters', '+1/+1', 'modular'],
            'tags' => ['counters', 'proliferate'],
            'needles' => ['+1/+1 counter', 'put a counter', 'enters with', 'proliferate'],
            'related' => ['tokens', 'proliferate', 'aggro'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Counter generator',
                    'needles' => ['+1/+1 counter', 'put a counter', 'enters with', 'adapt', 'bolster', 'outlast'],
                    'target' => 12,
                ],
                self::COMPONENT_MULTIPLIER => [
                    'label' => 'Counter multiplier',
                    'needles' => ['twice that many', 'double the number', 'that many plus', 'for each counter'],
                    'target' => 3,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Proliferate',
                    'needles' => ['proliferate'],
                    'target' => 4,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Counter payoff',
                    'needles' => ['for each +1/+1 counter', 'counters on', 'remove a counter', 'creatures you control get'],
                    'target' => 7,
                ],
            ],
            'structure' => [],
        ],
        'proliferate' => [
            'label' => 'Proliferate',
            'description' => 'Place counters of every kind, then proliferate them out of control.',
            'aliases' => ['proliferate'],
            'tags' => ['proliferate', 'counters', 'toxic'],
            'needles' => ['proliferate'],
            'related' => ['plus-1-plus-1-counters', 'infect'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Counter source',
                    'needles' => ['+1/+1 counter', 'loyalty counter', 'oil counter', 'charge counter', 'poison counter'],
                    'target' => 10,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Proliferate effect',
                    'needles' => ['proliferate'],
                    'target' => 8,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Counter payoff',
                    'needles' => ['for each counter', 'infect', 'toxic', 'poison', 'loyalty abilities', 'win the game'],
                    'target' => 6,
                ],
            ],
            'structure' => [],
        ],
        'aristocrats' => [
            'label' => 'Aristocrats',
            'description' => 'Sacrifice your own creatures for value and drain the table on the way out.',
            'aliases' => ['aristocrats', 'sacrifice', 'sac', 'death triggers'],
            'tags' => ['aristocrats', 'tokens', 'etb'],
            'needles' => ['sacrifice a creature', 'sacrifice another', 'whenever a creature you control dies'],
            'related' => ['tokens', 'graveyard', 'reanimator'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Sacrifice fodder',
                    'needles' => ['create a token', 'undying', 'persist', 'populate'],
                    'target' => 10,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Sacrifice outlet',
                    'needles' => ['sacrifice a creature', 'sacrifice another', 'as an additional cost, sacrifice'],
                    'target' => 6,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Death payoff',
                    'needles' => ['whenever a creature you control dies', 'each opponent loses', 'whenever you sacrifice', 'dies, draw'],
                    'target' => 8,
                ],
            ],
            'structure' => [],
        ],
        'graveyard' => [
            'label' => 'Graveyard',
            'description' => 'Treat the graveyard as a second hand: fill it, then mine it for value.',
            'aliases' => ['graveyard', 'self-mill', 'self mill', 'mill', 'descend', 'delirium'],
            'tags' => ['graveyard', 'mill', 'reanimator'],
            'needles' => ['from your graveyard', 'mill ', 'surveil', 'put into your graveyard'],
            'related' => ['reanimator', 'aristocrats'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Graveyard filler',
                    'needles' => ['mill ', 'surveil', 'discard', 'put into your graveyard'],
                    'target' => 8,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Recursion',
                    'needles' => ['return .* from your graveyard', 'unearth', 'flashback', 'escape', 'disturb'],
                    'target' => 8,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Graveyard payoff',
                    'needles' => ['for each card in your graveyard', 'cards in your graveyard', 'delirium', 'threshold'],
                    'target' => 6,
                ],
            ],
            'structure' => [],
        ],
        'reanimator' => [
            'label' => 'Reanimator',
            'description' => 'Put fat threats into the graveyard early and cheat them onto the battlefield.',
            'aliases' => ['reanimator', 'reanimate', 'recursion'],
            'tags' => ['reanimator', 'graveyard', 'mill'],
            'needles' => ['return .* from your graveyard', 'reanimate', 'from a graveyard onto the battlefield'],
            'related' => ['graveyard', 'aristocrats'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Enabler / self-mill',
                    'needles' => ['mill ', 'discard', 'surveil', 'put into your graveyard'],
                    'target' => 8,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Reanimation spell',
                    'needles' => ['return .* from your graveyard', 'reanimate', 'onto the battlefield'],
                    'target' => 8,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Reanimation target',
                    'needles' => ['when .* enters', 'destroy all', 'each opponent sacrifices'],
                    'target' => 6,
                ],
            ],
            'structure' => [],
        ],
        'spellslinger' => [
            'label' => 'Spellslinger',
            'description' => 'Chain cheap instants and sorceries into cast-trigger payoffs.',
            'aliases' => ['spellslinger', 'spells matter', 'storm', 'magecraft'],
            'tags' => ['spellslinger', 'draw'],
            'needles' => ['instant or sorcery', 'whenever you cast an instant', 'magecraft', 'prowess'],
            'related' => ['control', 'card-draw'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Cheap spell / cantrip',
                    'needles' => ['draw a card', 'scry', 'exile the top'],
                    'target' => 14,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Cost reduction / ritual',
                    'needles' => ['instant and sorcery spells cost', 'add \\{', 'copy target instant'],
                    'target' => 5,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Cast trigger',
                    'needles' => ['whenever you cast an instant', 'magecraft', 'prowess', 'copy that spell', 'storm'],
                    'target' => 8,
                ],
            ],
            'structure' => ['lands' => 35, 'draw' => 14],
        ],
        'artifacts' => [
            'label' => 'Artifacts',
            'description' => 'Artifacts as both mana and payoff: rocks, cost reduction, and affinity finishers.',
            'aliases' => ['artifacts', 'artifact', 'affinity', 'artificers', 'improvise'],
            // Deliberately not the broad `artifacts` theme tag: half the format
            // mentions the word "artifact" (every Gnome token, every equipment),
            // and matching on it would label unrelated decks as artifact decks.
            // Identifying the *strategy* needs artifact-deck language.
            'tags' => ['treasure'],
            'needles' => ['artifacts you control', 'for each artifact', 'metalcraft', 'artifact spells cost', 'whenever an artifact', 'improvise', 'affinity for artifacts'],
            'related' => ['treasure', 'plus-1-plus-1-counters'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Artifact source',
                    'needles' => ['create a treasure', 'artifact token', 'clue token', 'food token'],
                    'target' => 10,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Cost reduction / mana rock',
                    'needles' => ['\\{t\\}: add', 'artifact spells cost', 'costs \\{1\\} less'],
                    'target' => 10,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Artifact payoff',
                    'needles' => ['for each artifact', 'artifacts you control', 'metalcraft', 'whenever an artifact'],
                    'target' => 8,
                ],
            ],
            // Mana rocks satisfy ramp AND strategy density, so ramp runs high.
            'structure' => ['ramp' => 12],
        ],
        'treasure' => [
            'label' => 'Treasure / Ramp',
            'description' => 'Accelerate hard, then dump the mana into oversized spells.',
            'aliases' => ['treasure', 'treasures', 'ramp', 'big mana', 'rock'],
            'tags' => ['treasure', 'ramp', 'dork'],
            'needles' => ['treasure token', 'add \\{', 'search your library for a basic'],
            'related' => ['artifacts', 'lands-matter'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Mana source',
                    'needles' => ['\\{t\\}: add', 'add \\{', 'create a treasure', 'search your library for a'],
                    'target' => 14,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Mana sink',
                    'needles' => ['\\{x\\}', 'for each', 'without paying', 'extra turn', 'cascade'],
                    'target' => 8,
                ],
            ],
            'structure' => ['ramp' => 14],
        ],
        'lands-matter' => [
            'label' => 'Lands Matter / Landfall',
            'description' => 'Extra land drops, land recursion, and landfall triggers.',
            'aliases' => ['lands matter', 'landfall', 'lands', 'land destruction'],
            'tags' => ['landfall', 'ramp'],
            'needles' => ['landfall', 'whenever a land enters', 'lands you control', 'play an additional land'],
            'related' => ['treasure', 'graveyard'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Extra land drop',
                    'needles' => ['play an additional land', 'put a land', 'search your library for a'],
                    'target' => 12,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Landfall trigger',
                    'needles' => ['landfall', 'whenever a land enters', 'for each land'],
                    'target' => 10,
                ],
            ],
            'structure' => ['lands' => 38, 'ramp' => 12],
        ],
        'equipment' => [
            'label' => 'Equipment / Voltron',
            'description' => 'Suit up one threat and win through commander damage.',
            'aliases' => ['equipment', 'voltron', 'auras', 'enchantress'],
            'tags' => ['equipment', 'auras'],
            'needles' => ['equip ', 'equipped creature', 'enchant creature', 'attach'],
            'related' => ['aggro', 'plus-1-plus-1-counters'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Equipment / aura',
                    'needles' => ['equip ', 'equipment', 'enchant creature'],
                    'target' => 12,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Tutor / free attach',
                    'needles' => ['search your library for an equipment', 'attach target', 'equip \\{0\\}'],
                    'target' => 5,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Protection / evasion',
                    'needles' => ['double strike', 'hexproof', 'indestructible', 'can\'t be blocked', 'trample'],
                    'target' => 8,
                ],
            ],
            'structure' => ['protection' => 6],
        ],
        'aggro' => [
            'label' => 'Aggro',
            'description' => 'Cheap threats, combat tricks, and extra attacks to close fast.',
            'aliases' => ['aggro', 'attack triggers', 'extra combats', 'combat', 'tempo', 'zoo'],
            'tags' => ['go_wide', 'tokens'],
            'needles' => ['whenever .* attacks', 'additional combat phase', 'attacking creatures', 'haste'],
            'related' => ['tokens', 'equipment', 'plus-1-plus-1-counters'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Threat',
                    'needles' => ['haste', 'trample', 'flying', 'menace'],
                    'target' => 16,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Combat payoff',
                    'needles' => ['whenever .* attacks', 'additional combat phase', 'creatures you control get', 'double strike'],
                    'target' => 10,
                ],
            ],
            'structure' => ['lands' => 34, 'board_wipe' => 1],
        ],
        'anthems' => [
            'label' => 'Anthems',
            'description' => 'Static pumps that turn a wide board into lethal damage.',
            'aliases' => ['anthems', 'anthem', 'pump'],
            'tags' => ['go_wide'],
            'needles' => ['creatures you control get', 'other creatures you control get'],
            'related' => ['tokens', 'aggro'],
            'package' => [
                self::COMPONENT_PAYOFF => [
                    'label' => 'Anthem',
                    'needles' => ['creatures you control get', 'other creatures you control get'],
                    'target' => 8,
                ],
            ],
            'structure' => [],
        ],
        'blink' => [
            'label' => 'Blink / ETB',
            'description' => 'Re-trigger enters-the-battlefield value over and over.',
            'aliases' => ['blink', 'flicker', 'etb', 'etb effects'],
            'tags' => ['blink', 'etb'],
            'needles' => ['exile .* return', 'flicker', 'enters the battlefield'],
            'related' => ['card-draw', 'control'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'ETB body',
                    'needles' => ['when .* enters', 'enters the battlefield'],
                    'target' => 14,
                ],
                self::COMPONENT_ENABLER => [
                    'label' => 'Blink effect',
                    'needles' => ['exile .* return', 'flicker', 'return it to the battlefield'],
                    'target' => 8,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'ETB payoff',
                    'needles' => ['whenever a creature you control enters', 'whenever another creature enters'],
                    'target' => 5,
                ],
            ],
            'structure' => [],
        ],
        'control' => [
            'label' => 'Control',
            'description' => 'Counterspells, removal, and card advantage until you stabilise.',
            'aliases' => ['control', 'stax', 'prison', 'pillow fort', 'hatebears'],
            'tags' => ['draw', 'removal', 'board_wipe'],
            'needles' => ['counter target', 'destroy target', 'destroy all', 'can\'t attack'],
            'related' => ['card-draw', 'spellslinger'],
            'package' => [
                self::COMPONENT_ENABLER => [
                    'label' => 'Interaction',
                    'needles' => ['counter target', 'destroy target', 'exile target'],
                    'target' => 14,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Win condition',
                    'needles' => ['win the game', 'each opponent loses', 'extra turn'],
                    'target' => 4,
                ],
            ],
            'structure' => ['removal' => 12, 'board_wipe' => 4, 'draw' => 12],
        ],
        'card-draw' => [
            'label' => 'Card Draw',
            'description' => 'Refill relentlessly and out-resource the table.',
            'aliases' => ['card draw', 'draw', 'impulse draw', 'wheel'],
            'tags' => ['draw'],
            'needles' => ['draw a card', 'draw two cards', 'draw three cards'],
            'related' => ['control', 'spellslinger'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Draw engine',
                    'needles' => ['draw a card', 'draw two cards', 'whenever you draw'],
                    'target' => 16,
                ],
            ],
            'structure' => ['draw' => 16],
        ],
        'lifegain' => [
            'label' => 'Lifegain',
            'description' => 'Gain life incidentally, then convert the total into a win.',
            'aliases' => ['lifegain', 'life gain', 'lifelink', 'group hug'],
            'tags' => ['lifegain'],
            'needles' => ['you gain', 'gain life', 'lifelink'],
            'related' => ['aristocrats', 'tokens'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Life source',
                    'needles' => ['you gain', 'gain life', 'lifelink'],
                    'target' => 12,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Lifegain payoff',
                    'needles' => ['whenever you gain life', 'your life total', 'for each life'],
                    'target' => 8,
                ],
            ],
            'structure' => [],
        ],
        'infect' => [
            'label' => 'Infect / Toxic',
            'description' => 'Win on poison counters instead of damage.',
            'aliases' => ['infect', 'toxic', 'poison'],
            'tags' => ['toxic', 'counters'],
            'needles' => ['infect', 'toxic', 'poison counter'],
            'related' => ['proliferate', 'plus-1-plus-1-counters'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Infect threat',
                    'needles' => ['infect', 'toxic'],
                    'target' => 10,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Poison payoff',
                    'needles' => ['proliferate', 'poison counter', 'can\'t be blocked'],
                    'target' => 8,
                ],
            ],
            'structure' => ['protection' => 5],
        ],
        'combo' => [
            'label' => 'Combo',
            'description' => 'Assemble a two- or three-card loop and protect it.',
            'aliases' => ['combo', 'infinite', 'glass cannon'],
            'tags' => ['draw'],
            'needles' => ['search your library for', 'return .* to your hand', 'untap target', 'win the game'],
            'related' => ['control', 'spellslinger'],
            'package' => [
                self::COMPONENT_ENABLER => [
                    'label' => 'Tutor / protection',
                    'needles' => ['search your library for', 'counter target', 'hexproof'],
                    'target' => 10,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Combo finisher',
                    'needles' => ['win the game', 'each opponent loses', 'infinite'],
                    'target' => 5,
                ],
            ],
            'structure' => [],
        ],
        'tribal' => [
            'label' => 'Tribal',
            'description' => 'A creature type deck: lords, tutors, and type-wide payoffs.',
            'aliases' => ['tribal', 'kindred', 'gnomes', 'humans', 'goblins', 'soldiers', 'dwarves', 'angels', 'dinosaurs', 'legends', 'elves', 'zombies', 'vampires', 'dragons'],
            'tags' => ['tribal_goblin', 'tribal_elf', 'tribal_zombie', 'tribal_vampire', 'tribal_dragon', 'tribal_angel', 'tribal_dinosaur', 'go_wide'],
            'needles' => ['creatures you control get', 'other .* you control'],
            'related' => ['aggro', 'tokens', 'anthems'],
            'package' => [
                self::COMPONENT_GENERATOR => [
                    'label' => 'Tribe member',
                    'needles' => ['other .* you control', 'creature type'],
                    'target' => 20,
                ],
                self::COMPONENT_PAYOFF => [
                    'label' => 'Tribal payoff',
                    'needles' => ['creatures you control get', 'for each .* you control', 'choose a creature type'],
                    'target' => 8,
                ],
            ],
            'structure' => [],
        ],
        self::FALLBACK_ID => [
            'label' => 'Staples & Support',
            'description' => 'Color-identity staples: ramp, draw, interaction, and lands to round out any list.',
            'aliases' => ['staples', 'good stuff', 'goodstuff', 'midrange', 'casual', 'toolbox'],
            'tags' => ['ramp', 'draw', 'removal', 'board_wipe'],
            'needles' => ['draw a card', 'destroy target', 'add \\{'],
            'related' => [],
            'package' => [],
            'structure' => [],
        ],
    ];

    /**
     * Universal deck structure targets. Strategies override individual keys via
     * their `structure` map — these are defaults, not rigid rules, and a single
     * card is allowed to satisfy several of them (a mana rock in an artifact
     * deck counts as both ramp and strategy density).
     *
     * @var array<string, int>
     */
    private const BASE_STRUCTURE = [
        'lands' => 36,
        'ramp' => 10,
        'draw' => 10,
        'removal' => 8,
        'board_wipe' => 2,
        'protection' => 3,
        'finisher' => 3,
    ];

    /** @var array<string, string>|null */
    private static ?array $aliasIndex = null;

    /** @return list<string> */
    public function slugs(): array
    {
        return array_keys(self::THEMES);
    }

    public function has(string $slug): bool
    {
        return isset(self::THEMES[$slug]);
    }

    /**
     * @return ?array{
     *   id: string, label: string, description: string, aliases: list<string>,
     *   tags: list<string>, needles: list<string>, related: list<string>,
     *   package: array<string, array{label: string, needles: list<string>, target: int}>,
     *   structure: array<string, int>
     * }
     */
    public function get(string $slug): ?array
    {
        $theme = self::THEMES[$slug] ?? null;
        if (null === $theme) {
            return null;
        }

        return ['id' => $slug] + $theme;
    }

    public function label(string $slug): string
    {
        return self::THEMES[$slug]['label'] ?? ucwords(str_replace('-', ' ', $slug));
    }

    public function description(string $slug): string
    {
        return self::THEMES[$slug]['description'] ?? '';
    }

    /** @return list<string> */
    public function relatedSlugs(string $slug): array
    {
        return self::THEMES[$slug]['related'] ?? [];
    }

    /**
     * Package component definitions for a strategy, used for both structural
     * quotas and package-completion scoring.
     *
     * @return array<string, array{label: string, needles: list<string>, target: int}>
     */
    public function package(string $slug): array
    {
        return self::THEMES[$slug]['package'] ?? [];
    }

    /**
     * Deck structure targets for a strategy: base values with the strategy's
     * own overrides applied.
     *
     * @return array<string, int>
     */
    public function structure(string $slug): array
    {
        return array_merge(self::BASE_STRUCTURE, self::THEMES[$slug]['structure'] ?? []);
    }

    /** @return list<string> */
    public function tags(string $slug): array
    {
        return self::THEMES[$slug]['tags'] ?? [];
    }

    /** @return list<string> */
    public function needles(string $slug): array
    {
        return self::THEMES[$slug]['needles'] ?? [];
    }

    /**
     * Map an arbitrary provider tag ("+1/+1 Counters", "Counters Matter",
     * "Self-Mill") onto a canonical slug. Returns null when the tag has no
     * home in our taxonomy, which is normal — providers carry plenty of tags
     * that are flavour rather than strategy ("Casual", "Budget").
     */
    public function normalizeTag(string $tag): ?string
    {
        $key = $this->normalizeKey($tag);
        if ('' === $key) {
            return null;
        }

        return $this->aliasIndex()[$key] ?? null;
    }

    /**
     * @param list<string> $tags
     *
     * @return list<string> canonical slugs, order preserved, deduplicated
     */
    public function normalizeTags(array $tags): array
    {
        $out = [];
        foreach ($tags as $tag) {
            $slug = $this->normalizeTag((string) $tag);
            if (null !== $slug) {
                $out[$slug] = true;
            }
        }

        return array_keys($out);
    }

    /** @return array<string, string> */
    private function aliasIndex(): array
    {
        if (null !== self::$aliasIndex) {
            return self::$aliasIndex;
        }

        $index = [];
        foreach (self::THEMES as $slug => $theme) {
            $index[$this->normalizeKey($slug)] = $slug;
            $index[$this->normalizeKey($theme['label'])] = $slug;
            foreach ($theme['aliases'] as $alias) {
                $index[$this->normalizeKey($alias)] = $slug;
            }
        }

        return self::$aliasIndex = $index;
    }

    private function normalizeKey(string $value): string
    {
        $lower = strtolower(trim($value));
        // Spell out "+" then strip every separator, so "+1/+1 Counters",
        // "plus-1-plus-1-counters" and "+1/+1 counters" all collapse to the
        // same key ("plus1plus1counters").
        $lower = str_replace('+', 'plus', $lower);

        return (string) preg_replace('/[^a-z0-9]+/', '', $lower);
    }
}
