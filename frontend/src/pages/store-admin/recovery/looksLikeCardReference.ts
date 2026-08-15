/** True when the operator pasted a Scryfall link, card id, or set/collector — not a name. */
export function looksLikeCardReference(value: string): boolean {
  const text = value.trim()
  if (text === '') return false
  if (/scryfall\.com\/card\//i.test(text)) return true
  if (/api\.scryfall\.com\/cards\//i.test(text)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true
  if (/^[a-z0-9]{2,10}[/ ][a-z0-9\u2605*-]{1,20}$/i.test(text)) return true
  return false
}
