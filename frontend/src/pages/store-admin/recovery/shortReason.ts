/** One-line label for a failed CSV row. The full server sentence stays in a tooltip. */
export function shortRowReason(error?: string | null): string {
  const text = (error ?? '').toLowerCase()
  if (text.includes('market price')) return 'No market price'
  if (text.includes('online-only') || text.includes('alchemy')) return 'Online-only'
  if (text.includes('quantity')) return 'Invalid quantity'
  if (text.includes('not from this import')) return 'Wrong game'
  if (
    text.includes('no matching') ||
    text.includes('no match') ||
    text.includes('not found') ||
    text.includes('catalog match')
  ) {
    return 'No catalog match'
  }
  if (!error) return 'Needs a match'
  const first = error.split(/[.]/)[0]?.trim()
  return first && first.length <= 48 ? first : 'Could not import'
}
