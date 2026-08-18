/**
 * Presentation for the supported-games tiles on the landing page.
 *
 * The game list itself comes from the API (`GET /catalog/games`); this only maps
 * a known game code to art and an accent so each tile has identity. Codes we
 * don't recognise fall back to a neutral treatment rather than breaking.
 *
 * `art` is deliberately optional. Only images verified to be a real card from
 * that game are referenced here — several files in /public/brand/cards are
 * misnamed (every `fab-*.jpg` is actually a Magic or Weiss Schwarz card, and the
 * `op-*.jpg` scans carry a large "SAMPLE" watermark), so those games render a
 * typographic tile instead of the wrong game's card. Drop a correctly licensed
 * scan in /public/brand/cards and point `art` at it to upgrade a tile.
 */

export type GameTile = {
  /** Verified card art from /public/brand/cards. Omit to render a text tile. */
  art?: string
  accent: string
  /** Short label — the API name can be long ("Riftbound: League of Legends"). */
  short: string
}

const TILES: Record<string, GameTile> = {
  mtg: { art: '/brand/cards/mtg-lotus.jpg', accent: '#c6a035', short: 'Magic' },
  pokemon: { art: '/brand/cards/pkm-charizard.jpg', accent: '#ef4444', short: 'Pokémon' },
  riftbound: { art: '/brand/cards/rb-jinx.jpg', accent: '#8b5cf6', short: 'Riftbound' },
  // Awaiting art: the bundled scans are watermarked / from the wrong game.
  onepiece: { accent: '#f59e0b', short: 'One Piece' },
  fab: { accent: '#10b981', short: 'Flesh & Blood' },
}

const FALLBACK: GameTile = { accent: '#71717a', short: 'Trading cards' }

export function gameTile(code?: string | null, name?: string | null): GameTile {
  const tile = code ? TILES[code.trim().toLowerCase()] : undefined
  if (tile) return tile
  return { ...FALLBACK, short: name?.trim() || FALLBACK.short }
}
