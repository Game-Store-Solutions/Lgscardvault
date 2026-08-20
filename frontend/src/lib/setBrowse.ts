/** Storefront URL for browsing in-stock cards from one set. */
export function setBrowsePath(slug: string, setCode: string, gameCode?: string): string {
  const normalized = setCode.trim().toLowerCase()
  const path = `/s/${slug}/sets/${encodeURIComponent(normalized)}`
  const game = gameCode?.trim()
  if (!game) {
    return path
  }
  return `${path}?game=${encodeURIComponent(game)}`
}

export function normalizeSetCode(code: string): string {
  return code.trim().toLowerCase()
}
