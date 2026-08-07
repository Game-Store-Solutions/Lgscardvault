/** Lowercase + strip accents for inclusive client-side search. */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

export function searchTextIncludes(haystack: string, needle: string): boolean {
  const n = foldSearchText(needle)
  if (!n) return true
  return foldSearchText(haystack).includes(n)
}
