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
  return foldSearchText(catalogCardIdentity(name)) === foldSearchText(catalogCardIdentity(query))
}

/**
 * TCGPlayer titles stash set/treatment in the name. "Shanks (OP04) (Manga)"
 * and "Shanks - OP09-004 (Gold)" are the same card for typeahead + printings.
 */
export function catalogCardIdentity(name: string): string {
  let base = name.trim()
  if (!base) return ''
  let previous = ''
  while (previous !== base) {
    previous = base
    base = base.replace(/\s*[([{][^)\]}]+[)\]}]\s*$/u, '').trim()
  }
  base = base.replace(/\s+-\s+[A-Za-z]{1,8}\d{0,4}(?:-[A-Za-z0-9]+)?\s*$/u, '').trim()
  return base || name.trim()
}

export function searchTextIncludes(haystack: string, needle: string): boolean {
  const n = foldSearchText(needle)
  if (!n) return true
  return foldSearchText(haystack).includes(n)
}

export type SetSearchOption = { code: string; name: string }

/** Rank store/catalog sets like name typeahead (exact/prefix first). */
export function rankSetSearch(sets: SetSearchOption[], rawQuery: string): SetSearchOption[] {
  const needle = foldSearchText(rawQuery)
  if (!needle) return []

  const scored: Array<{ set: SetSearchOption; score: number; code: string }> = []
  for (const set of sets) {
    const code = set.code ?? ''
    const name = set.name ?? ''
    // Require code/name prefix or a word-start hit — not mid-word scraps
    // ("tl" must not match "Battle" inside Commander Legends: Battle…).
    const score = Math.min(typeaheadNameTier(code, rawQuery), typeaheadNameTier(name, rawQuery))
    if (score > 2) continue
    scored.push({ set, score, code: foldSearchText(code) })
  }

  scored.sort((a, b) => a.score - b.score || a.code.localeCompare(b.code) || a.set.name.localeCompare(b.set.name))
  return scored.map((entry) => entry.set)
}
