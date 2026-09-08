/** Lowercase + strip accents for inclusive client-side search. */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** Lower is better: exact, then name prefix, then a later word, then anything else. */
export function typeaheadNameTier(name: string, query: string): number {
  const foldedName = foldSearchText(name)
  const foldedQuery = foldSearchText(query)
  if (!foldedQuery) return 3
  if (foldedName === foldedQuery) return 0
  if (foldedName.startsWith(foldedQuery)) return 1
  const tokens = foldedName.split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.some((token) => token.startsWith(foldedQuery))) return 2
  return 3
}

export function catalogNamesMatch(name: string, query: string): boolean {
  return foldSearchText(name) === foldSearchText(query)
}

export function searchTextIncludes(haystack: string, needle: string): boolean {
  const n = foldSearchText(needle)
  if (!n) return true
  return foldSearchText(haystack).includes(n)
}
