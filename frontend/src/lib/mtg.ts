/**
 * MTG presentation helpers — rarity accent colors and the foil shimmer, used to
 * add a little game flavor to storefront cards.
 */

/** Accent color for a card's rarity (gemstone-inspired), for dots/borders. */
export function rarityAccent(rarity?: string | null): string {
  switch ((rarity ?? '').toLowerCase()) {
    case 'mythic':
      return '#e2601a' // mythic orange
    case 'rare':
      return '#c8a02c' // rare gold
    case 'uncommon':
      return '#8a99a8' // uncommon silver
    case 'common':
      return '#3b3b3b' // common black
    case 'special':
    case 'bonus':
      return '#8b5cf6'
    default:
      return '#6d5efc' // brand fallback
  }
}

export function rarityLabel(rarity?: string | null): string {
  const r = (rarity ?? '').trim()
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
}

/** Iridescent foil sheen for badges / accents. */
export const FOIL_GRADIENT =
  'linear-gradient(110deg, #ffd1e8 0%, #c4b5fd 22%, #a5f3fc 46%, #bbf7d0 68%, #fde68a 88%, #ffd1e8 100%)'

/** Color-identity pip fills (WUBRG + colorless), for tiny color dots. */
export const MANA_COLORS: Record<string, string> = {
  W: '#f8f4d8',
  U: '#3b82f6',
  B: '#3f3a44',
  R: '#ef4444',
  G: '#22a35a',
  C: '#a8a29e',
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const

/**
 * Canonical identity key: "W", "WU", "C", … . Gold cards are the full
 * combination, never the individual pips — so a White filter stays mono-white.
 */
export function colorIdentityKey(colors: readonly string[]): string {
  const letters = WUBRG.filter((letter) =>
    colors.some((color) => color.toUpperCase() === letter),
  )
  return letters.length > 0 ? letters.join('') : 'C'
}

/** True when the card's identity is exactly the selected pips (order-insensitive). */
export function matchesExactColorIdentity(
  cardColors: readonly string[],
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true
  return colorIdentityKey(cardColors) === colorIdentityKey(selected)
}
