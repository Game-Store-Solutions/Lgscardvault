/**
 * Accent + label styling for the supported-games tiles on the landing page.
 *
 * The games and their card art both come from the API
 * (`GET /catalog/games/showcase`, which reads real art out of the card catalog);
 * this only supplies the brand accent and a short label, because the API name
 * can be long ("Riftbound: League of Legends"). Unknown codes get a neutral
 * accent so a newly added game still renders.
 */

export type GameTileStyle = {
  accent: string
  short: string
}

const TILES: Record<string, GameTileStyle> = {
  mtg: { accent: '#2563eb', short: 'Magic' },
  pokemon: { accent: '#ef4444', short: 'Pokémon' },
  onepiece: { accent: '#f59e0b', short: 'One Piece' },
  fab: { accent: '#10b981', short: 'Flesh & Blood' },
  riftbound: { accent: '#8b5cf6', short: 'Riftbound' },
}

const FALLBACK: GameTileStyle = { accent: '#71717a', short: 'Trading cards' }

export function gameTile(code?: string | null, name?: string | null): GameTileStyle {
  const tile = code ? TILES[code.trim().toLowerCase()] : undefined
  if (tile) return tile
  return { ...FALLBACK, short: name?.trim() || FALLBACK.short }
}
