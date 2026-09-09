/**
 * Inventory notes written by the CSV importer are line-structured
 * ("Game: Magic", "Variant: Borderless", plus free text). Raw dumping that
 * onto inventory tiles looks like debris, so this parses the known prefixes
 * out into displayable chips and keeps the rest as plain text.
 */
export interface ParsedInventoryNotes {
  /** Non-Magic game name, if any ("Magic"/"MTG" variants are dropped as noise). */
  game: string | null
  /** Printing variant ("Borderless", "Showcase", …). */
  variant: string | null
  /** Remaining free-text note lines, joined. */
  text: string | null
}

const MAGIC_NAMES = new Set(['magic', 'mtg', 'magic: the gathering', 'magic the gathering'])

export function parseInventoryNotes(notes: string | null | undefined): ParsedInventoryNotes {
  if (!notes) return { game: null, variant: null, text: null }

  let game: string | null = null
  let variant: string | null = null
  const rest: string[] = []

  for (const rawLine of notes.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const gameMatch = line.match(/^game:\s*(.+)$/i)
    if (gameMatch) {
      const value = gameMatch[1].trim()
      if (!MAGIC_NAMES.has(value.toLowerCase())) game = value
      continue
    }
    const variantMatch = line.match(/^variant:\s*(.+)$/i)
    if (variantMatch) {
      variant = variantMatch[1].trim()
      continue
    }
    rest.push(line)
  }

  return { game, variant, text: rest.length > 0 ? rest.join(' · ') : null }
}

/** Split importer variant lines ("Borderless, Showcase") into discrete chips. */
export function variantChips(variant: string | null | undefined): string[] {
  if (!variant?.trim()) return []
  return variant
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

