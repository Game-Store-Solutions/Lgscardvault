/** Scryfall `legalities` object keys → display names (matches Scryfall API). */
const FORMAT_LABELS: Record<string, string> = {
  standard: 'Standard',
  future: 'Future',
  historic: 'Historic',
  timeless: 'Timeless',
  gladiator: 'Gladiator',
  pioneer: 'Pioneer',
  explorer: 'Explorer',
  modern: 'Modern',
  legacy: 'Legacy',
  pauper: 'Pauper',
  vintage: 'Vintage',
  penny: 'Penny',
  commander: 'Commander',
  oathbreaker: 'Oathbreaker',
  standardbrawl: 'Standard Brawl',
  brawl: 'Brawl',
  alchemy: 'Alchemy',
  paupercommander: 'Pauper Commander',
  duel: 'Duel',
  oldschool: 'Old School',
  premodern: 'Premodern',
  predh: 'PreDH',
  historicbrawl: 'Historic Brawl',
  competitive: 'Competitive',
}

export type ScryfallLegalityStatus = 'legal' | 'not_legal' | 'restricted' | 'banned'

export function formatLegalityName(formatKey: string): string {
  const key = formatKey.trim().toLowerCase()
  if (FORMAT_LABELS[key]) return FORMAT_LABELS[key]
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Formats where Scryfall status is exactly `legal` (stored on the card in DB). */
export function legalFormatsFromScryfall(legalities?: Record<string, string> | null): { key: string; label: string }[] {
  if (!legalities) return []
  return Object.entries(legalities)
    .filter(([, status]) => status === 'legal')
    .map(([key]) => ({ key, label: formatLegalityName(key) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function hasNonLegalScryfallEntries(legalities?: Record<string, string> | null): boolean {
  if (!legalities) return false
  return Object.values(legalities).some((status) => status !== 'legal')
}

export function scryfallLegalityCount(legalities?: Record<string, string> | null): number {
  return Object.keys(legalities ?? {}).length
}
