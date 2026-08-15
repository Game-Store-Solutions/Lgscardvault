/** True when the operator pasted a Scryfall link, card id, or set/collector — not a name. */
export function looksLikeCardReference(value: string): boolean {
  const text = value.trim()
  if (text === '') return false
  if (/scryfall\.com\/card\//i.test(text)) return true
  if (/api\.scryfall\.com\/cards\//i.test(text)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true
  // `bfz/190` or `c21 263` — collector must have a digit, otherwise two-word
  // names ("Snapping Gnarlid") and split names ("Fire/Ice") look like this.
  if (/^[a-z0-9]{2,10}[/ ][a-z0-9\u2605*-]*\d[a-z0-9\u2605*-]*$/i.test(text)) return true
  return false
}
