/**
 * Presentation for the supported-games tiles on the landing page.
 *
 * The game list itself comes from the API (`GET /catalog/games`); this only maps
 * a known game code to local art and an accent so each tile has identity. Codes
 * we don't recognise fall back to a neutral treatment rather than breaking.
 */

export type GameTile = {
  /** Card art from /public/brand/cards. */
  art: string
  accent: string
  /** Short label for narrow tiles — the API name can be long. */
  short: string
}

const TILES: Record<string, GameTile> = {
  mtg: { art: '/brand/cards/mtg-lotus.jpg', accent: '#c6a035', short: 'Magic' },
  pokemon: { art: '/brand/cards/pkm-charizard.jpg', accent: '#ef4444', short: 'Pokémon' },
  onepiece: { art: '/brand/cards/op-luffy.jpg', accent: '#f59e0b', short: 'One Piece' },
  fab: { art: '/brand/cards/fab-bravo.jpg', accent: '#10b981', short: 'Flesh & Blood' },
  riftbound: { art: '/brand/cards/rb-jinx.jpg', accent: '#8b5cf6', short: 'Riftbound' },
}

const FALLBACK: GameTile = {
  art: '/brand/cards/mtg-teferi.jpg',
  accent: '#71717a',
  short: 'Trading cards',
}

export function gameTile(code?: string | null, name?: string | null): GameTile {
  const tile = code ? TILES[code.trim().toLowerCase()] : undefined
  if (tile) return tile
  return { ...FALLBACK, short: name?.trim() || FALLBACK.short }
}
