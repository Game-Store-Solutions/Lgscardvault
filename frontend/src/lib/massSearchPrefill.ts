export const MASS_SEARCH_PREFILL_KEY = 'mass-search-prefill'

/** Save a decklist for the next store mass-search page the shopper opens. */
export function queueMassSearchPrefill(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  try {
    sessionStorage.setItem(MASS_SEARCH_PREFILL_KEY, trimmed)
  } catch {
    // Private mode or quota — shopper can still paste manually.
  }
}

export function hasMassSearchPrefill(): boolean {
  try {
    return Boolean(sessionStorage.getItem(MASS_SEARCH_PREFILL_KEY)?.trim())
  } catch {
    return false
  }
}

/** Format commander + deck rows into mass-search paste syntax. */
export function formatCardsForMassSearch(
  cards: { name: string; quantity?: number }[],
  commanderName?: string,
): string {
  const lines: string[] = []
  if (commanderName?.trim()) {
    lines.push(commanderName.trim())
  }
  for (const card of cards) {
    const name = card.name.trim()
    if (!name) continue
    const qty = Math.max(1, card.quantity ?? 1)
    lines.push(qty > 1 ? `${qty} ${name}` : name)
  }
  return lines.join('\n')
}
