/** Storefront URL for browsing in-stock cards from one set. */
export function setBrowsePath(slug: string, setCode: string): string {
  const normalized = setCode.trim().toLowerCase()
  return `/s/${slug}/sets/${encodeURIComponent(normalized)}`
}

export function normalizeSetCode(code: string): string {
  return code.trim().toLowerCase()
}
