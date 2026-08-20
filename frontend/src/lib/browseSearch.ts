import type { InventoryItem } from '../api/types'

/** Split a shopper query into tokens so "bolt lea" matches Lightning Bolt in LEA. */
export function browseQueryTokens(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function printingMatchesBrowseQuery(
  item: InventoryItem,
  rawQuery: string,
): boolean {
  const tokens = browseQueryTokens(rawQuery)
  if (tokens.length === 0) {
    return true
  }

  const card = item.card
  const number = (card.collectorNumber ?? '').toLowerCase()
  const haystack = [
    card.name,
    card.setName,
    card.setCode,
    number,
    number ? `#${number}` : '',
    card.typeLine,
    card.artist,
    item.finish,
    item.condition,
    item.isFoil ? 'foil holo' : 'nonfoil',
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()

  return tokens.every((token) => haystack.includes(token.replace(/^#/, '')) || haystack.includes(token))
}
