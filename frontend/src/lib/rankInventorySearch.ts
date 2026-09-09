import type { InventoryItem } from '../api/types'

/** Prefer name/set prefix matches so short queries don't feel random. */
export function rankInventorySearch(items: InventoryItem[], rawQuery: string): InventoryItem[] {
  const needle = rawQuery.trim().toLowerCase()
  if (!needle) return items

  const scored: Array<{ item: InventoryItem; score: number; name: string }> = []

  for (const item of items) {
    const name = item.card.name.toLowerCase()
    const setCode = (item.card.setCode ?? '').toLowerCase()
    const setName = (item.card.setName ?? '').toLowerCase()

    let score = -1
    if (name === needle || setCode === needle) score = 0
    else if (name.startsWith(needle)) score = 1
    else if (name.split(/[\s/-]+/).some((word) => word.startsWith(needle))) score = 2
    else if (name.includes(needle)) score = 3
    else if (setCode.startsWith(needle) || setCode.includes(needle)) score = 4
    else if (setName.includes(needle)) score = 5

    // Drop rows that do not match the live query (stale pages / broad API hits).
    if (score < 0) continue
    scored.push({ item, score, name })
  }

  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name) || a.item.id - b.item.id)
  return scored.map((entry) => entry.item)
}
