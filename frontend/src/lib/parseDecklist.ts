export type DecklistLine = {
  raw: string
  name: string
  quantity: number
}

/**
 * Parse a pasted decklist. Accepts `4 Lightning Bolt`, `4x Lightning Bolt`, or
 * a bare card name (quantity 1); blank lines and `#`/`//` comments are skipped,
 * and a trailing `(SET) 123` printing hint is ignored. Duplicate names merge.
 */
export function parseDecklist(text: string): DecklistLine[] {
  const byName = new Map<string, DecklistLine>()
  for (const rawLine of text.split('\n')) {
    const raw = rawLine.trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue
    const counted = /^(\d+)\s*[xX]?\s+(.+)$/.exec(raw)
    const quantity = counted ? Math.max(1, Number(counted[1])) : 1
    const name = (counted ? counted[2] : raw).replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w-]*\s*$/, '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) existing.quantity += quantity
    else byName.set(key, { raw, name, quantity })
  }
  return [...byName.values()]
}

/** Same parse, folded to lowercase names for inventory / buy-list matching. */
export function parseDecklistQuantities(text: string): Map<string, number> {
  const byName = new Map<string, number>()
  for (const line of parseDecklist(text)) {
    const key = line.name.toLowerCase()
    byName.set(key, (byName.get(key) ?? 0) + line.quantity)
  }
  return byName
}
