import type { InventoryItem } from '../api/types'
import { foldSearchText, typeaheadNameTier } from './searchText'

/**
 * Prefer Singles-style name tiers so short queries don't feel random.
 * Rows that only match set/type (API substring) rank after name hits.
 */
export function rankInventorySearch(items: InventoryItem[], rawQuery: string): InventoryItem[] {
  const needle = foldSearchText(rawQuery)
  if (!needle) return items

  const scored: Array<{ item: InventoryItem; score: number; name: string }> = []

  for (const item of items) {
    const name = item.card.name
    const foldedName = foldSearchText(name)
    const setCode = foldSearchText(item.card.setCode ?? '')
    const setName = foldSearchText(item.card.setName ?? '')
    const typeLine = foldSearchText(item.card.typeLine ?? '')
    const nameTier = typeaheadNameTier(name, rawQuery)
    const nameHits = foldedName.includes(needle) || nameTier < 3

    let score = -1
    if (nameHits) {
      score = nameTier
    } else if (setCode === needle) {
      score = 0
    } else if (setCode.startsWith(needle) || setCode.includes(needle)) {
      score = 4
    } else if (setName.includes(needle) || typeLine.includes(needle)) {
      score = 5
    }

    // Drop rows that do not match the live query (stale pages / broad API hits).
    if (score < 0) continue
    scored.push({ item, score, name: foldedName })
  }

  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name) || a.item.id - b.item.id)
  return scored.map((entry) => entry.item)
}
