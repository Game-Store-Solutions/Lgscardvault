/**
 * Storefront search copy and filters, in each game's own words.
 *
 * Magic uses mana pips and type lines. Pokémon filters by energy type,
 * One Piece by color, Flesh and Blood by pitch. A newly added game falls
 * back to a plain name/set search with no color chips.
 */

export type GameColorFilter = {
  key: string
  label: string
  /** Disc fill for the filter chip. */
  swatch: string
  /** True when the disc is light enough that a dark ring helps. */
  dark?: boolean
}

export type GameSearchVocab = {
  placeholder: string
  colorLabel: string
  colors: GameColorFilter[]
  types: string[]
}

const MTG: GameSearchVocab = {
  placeholder: 'Name, type, color, or set',
  colorLabel: 'Color',
  colors: [
    { key: 'W', label: 'White', swatch: '#f8f4d8', dark: true },
    { key: 'U', label: 'Blue', swatch: '#3b82f6' },
    { key: 'B', label: 'Black', swatch: '#3f3a44' },
    { key: 'R', label: 'Red', swatch: '#ef4444' },
    { key: 'G', label: 'Green', swatch: '#22a35a' },
    { key: 'C', label: 'Colorless', swatch: '#a8a29e', dark: true },
  ],
  types: ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle', 'Land'],
}

const POKEMON: GameSearchVocab = {
  placeholder: 'Name, energy type, or set',
  colorLabel: 'Energy type',
  colors: [
    { key: 'Grass', label: 'Grass', swatch: '#78C850' },
    { key: 'Fire', label: 'Fire', swatch: '#F08030' },
    { key: 'Water', label: 'Water', swatch: '#6890F0' },
    { key: 'Lightning', label: 'Lightning', swatch: '#F8D030', dark: true },
    { key: 'Psychic', label: 'Psychic', swatch: '#F85888' },
    { key: 'Fighting', label: 'Fighting', swatch: '#C03028' },
    { key: 'Darkness', label: 'Darkness', swatch: '#705848' },
    { key: 'Metal', label: 'Metal', swatch: '#B8B8D0', dark: true },
    { key: 'Dragon', label: 'Dragon', swatch: '#7038F8' },
    { key: 'Fairy', label: 'Fairy', swatch: '#EE99AC', dark: true },
    { key: 'Colorless', label: 'Colorless', swatch: '#A8A878', dark: true },
  ],
  types: ['Pokémon', 'Trainer', 'Energy', 'Item', 'Supporter', 'Stadium'],
}

const ONE_PIECE: GameSearchVocab = {
  placeholder: 'Name, color, or set',
  colorLabel: 'Color',
  colors: [
    { key: 'Red', label: 'Red', swatch: '#dc2626' },
    { key: 'Green', label: 'Green', swatch: '#16a34a' },
    { key: 'Blue', label: 'Blue', swatch: '#2563eb' },
    { key: 'Purple', label: 'Purple', swatch: '#7c3aed' },
    { key: 'Black', label: 'Black', swatch: '#1f2937' },
    { key: 'Yellow', label: 'Yellow', swatch: '#eab308', dark: true },
  ],
  types: ['Leader', 'Character', 'Event', 'Stage', 'DON!!'],
}

const FAB: GameSearchVocab = {
  placeholder: 'Name, class, or set',
  colorLabel: 'Pitch',
  colors: [
    { key: 'Red', label: 'Red', swatch: '#ef4444' },
    { key: 'Yellow', label: 'Yellow', swatch: '#eab308', dark: true },
    { key: 'Blue', label: 'Blue', swatch: '#3b82f6' },
  ],
  types: ['Attack', 'Defense', 'Action', 'Instant', 'Equipment', 'Weapon', 'Hero'],
}

const RIFTBOUND: GameSearchVocab = {
  placeholder: 'Name, color, or set',
  colorLabel: 'Color',
  colors: [
    { key: 'Fury', label: 'Fury', swatch: '#ef4444' },
    { key: 'Calm', label: 'Calm', swatch: '#3b82f6' },
    { key: 'Body', label: 'Body', swatch: '#22c55e' },
    { key: 'Mind', label: 'Mind', swatch: '#8b5cf6' },
    { key: 'Chaos', label: 'Chaos', swatch: '#f59e0b' },
  ],
  types: ['Unit', 'Spell', 'Battlefield', 'Gear', 'Legend'],
}

const GENERIC: GameSearchVocab = {
  placeholder: 'Name or set',
  colorLabel: 'Color',
  colors: [],
  types: [],
}

const BY_CODE: Record<string, GameSearchVocab> = {
  mtg: MTG,
  pokemon: POKEMON,
  onepiece: ONE_PIECE,
  fab: FAB,
  riftbound: RIFTBOUND,
}

export function gameSearchVocab(code?: string | null): GameSearchVocab {
  if (!code) return MTG
  return BY_CODE[code.trim().toLowerCase()] ?? GENERIC
}

export function isManaPipGame(code?: string | null): boolean {
  return !code || code.trim().toLowerCase() === 'mtg'
}
