import type { InventoryItem } from '../api/types'

function normalizeArtistName(value: string): string {
  return value.trim().normalize('NFC').toLowerCase()
}

/** Storefront URL for browsing in-stock cards by artist. */
export function artistBrowsePath(slug: string, artist: string, gameCode?: string): string {
  const params = new URLSearchParams({ name: artist.trim() })
  if (gameCode) {
    params.set('game', gameCode)
  }
  return `/s/${slug}/artists?${params.toString()}`
}

export function artistNamesMatch(a?: string | null, b?: string | null): boolean {
  const left = a?.trim() ?? ''
  const right = b?.trim() ?? ''
  if ('' === left || '' === right) {
    return false
  }
  return normalizeArtistName(left) === normalizeArtistName(right)
}

/** In-stock singles credited to this artist at the store. */
export function inventoryByArtist(
  inventory: InventoryItem[],
  artist: string,
  extra: InventoryItem[] = [],
): InventoryItem[] {
  const byId = new Map<number, InventoryItem>()
  for (const item of [...inventory, ...extra]) {
    if (itemMatchesArtist(item, artist)) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()]
}

function itemMatchesArtist(item: InventoryItem, artist: string): boolean {
  if (item.quantity <= 0) {
    return false
  }
  if (artistNamesMatch(item.card.artist, artist)) {
    return true
  }
  const faces = item.card.cardFaces ?? []
  return faces.some((face) => artistNamesMatch(face.artist, artist))
}

export function resolveCardArtist(
  card: { artist?: string | null; cardFaces?: { artist?: string | null }[] | null },
  faceIndex = 0,
): string | undefined {
  const faces = card.cardFaces ?? []
  const faceArtist = faces.length > 0 ? faces[faceIndex % faces.length]?.artist : undefined
  const artist = (faceArtist ?? card.artist)?.trim()
  return artist || undefined
}

/** @deprecated Path-segment URLs; kept for decoding old bookmarks. */
export function decodeArtistParam(encoded: string): string {
  try {
    return decodeURIComponent(encoded).trim()
  } catch {
    return encoded.trim()
  }
}
