/**
 * The five trading card games this platform actually carries.
 *
 * Codes match the backend catalog (`catalog_games.code`, seeded in
 * Version20260728020000) and the `game` query param accepted by
 * `GET /stores/{slug}/inventory`. Do not add a game here until it exists in
 * the catalog, or its tile will link to an empty result set.
 */
export interface TcgGame {
  /** Backend game code — used directly as the `game` query param. */
  code: string
  /** Full display name. */
  name: string
  /** Compact label for chips and breadcrumbs. */
  shortName: string
  /** Restrained per-game accent, used for hairlines and hover glow only. */
  accent: string
  /** Hero art for the category tile. */
  art: string
  /** Supporting art for stacked/fanned compositions. */
  artStack: string[]
}

export const TCG_GAMES: TcgGame[] = [
  {
    code: 'mtg',
    name: 'Magic: The Gathering',
    shortName: 'Magic',
    accent: '#c6a035',
    art: '/brand/cards/mtg-sheoldred.jpg',
    artStack: ['/brand/cards/mtg-sheoldred.jpg', '/brand/cards/mtg-lotus.jpg', '/brand/cards/mtg-ragavan.jpg'],
  },
  {
    code: 'pokemon',
    name: 'Pokémon',
    shortName: 'Pokémon',
    accent: '#eab308',
    art: '/brand/cards/pkm-charizard.jpg',
    artStack: ['/brand/cards/pkm-charizard.jpg', '/brand/cards/pkm-pikachu.jpg', '/brand/cards/pkm-rayquaza.jpg'],
  },
  {
    code: 'onepiece',
    name: 'One Piece Card Game',
    shortName: 'One Piece',
    accent: '#f97316',
    art: '/brand/cards/op-luffy.jpg',
    artStack: ['/brand/cards/op-luffy.jpg', '/brand/cards/op-zoro.jpg', '/brand/cards/op-shanks.jpg'],
  },
  {
    code: 'fab',
    name: 'Flesh and Blood',
    shortName: 'Flesh & Blood',
    accent: '#8b5cf6',
    art: '/brand/cards/fab-bravo.jpg',
    artStack: ['/brand/cards/fab-bravo.jpg', '/brand/cards/fab-prism.jpg', '/brand/cards/fab-dorinthea.jpg'],
  },
  {
    code: 'riftbound',
    name: 'Riftbound: League of Legends',
    shortName: 'Riftbound',
    accent: '#06b6d4',
    art: '/brand/cards/rb-jinx.jpg',
    artStack: ['/brand/cards/rb-jinx.jpg', '/brand/cards/rb-ahri.jpg', '/brand/cards/rb-lux.jpg'],
  },
]

const BY_CODE = new Map(TCG_GAMES.map((game) => [game.code, game]))

export function findTcgGame(code?: string | null): TcgGame | undefined {
  if (!code) return undefined
  return BY_CODE.get(code.toLowerCase())
}

/** Display name for a game code, falling back to the raw code. */
export function tcgGameName(code?: string | null): string {
  return findTcgGame(code)?.shortName ?? code ?? 'Unknown'
}

/** Accent hex for a game code, falling back to the brand accent token. */
export function tcgGameAccent(code?: string | null): string {
  return findTcgGame(code)?.accent ?? 'var(--color-accent-500)'
}

/** A spread of card art across all games — for hero compositions. */
export const SHOWCASE_ART: string[] = [
  '/brand/cards/mtg-sheoldred.jpg',
  '/brand/cards/pkm-charizard.jpg',
  '/brand/cards/op-luffy.jpg',
  '/brand/cards/rb-jinx.jpg',
  '/brand/cards/fab-bravo.jpg',
  '/brand/cards/mtg-lotus.jpg',
  '/brand/cards/pkm-rayquaza.jpg',
  '/brand/cards/op-shanks.jpg',
]
