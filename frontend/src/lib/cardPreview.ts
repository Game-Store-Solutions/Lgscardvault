import { cardImageUrl, formatPrice } from '../api/client'
import type { InventoryItem } from '../api/types'
import type { CardArtPreview } from '../components/cards'
import { finishName } from './finishes'

export function listingLabel(item: InventoryItem): string {
  const set = item.card.setCode ? item.card.setCode.toUpperCase() : null
  const finish = finishName(item.card, item.isFoil, item.finish)
  return [item.condition, finish, set].filter(Boolean).join(' · ')
}

export function cheapestPriceCents(
  priceCents?: number | null,
  options?: InventoryItem[] | null,
): number | null {
  const prices: number[] = []
  if (typeof priceCents === 'number' && priceCents > 0) {
    prices.push(priceCents)
  }
  for (const option of options ?? []) {
    if (option.priceCents > 0) {
      prices.push(option.priceCents)
    }
  }
  if (prices.length === 0) {
    return null
  }
  return Math.min(...prices)
}

export function priceLabelForCard(
  priceCents?: number | null,
  options?: InventoryItem[] | null,
): string | undefined {
  const min = cheapestPriceCents(priceCents, options)
  if (min == null) {
    return undefined
  }
  const optionCount = options?.length ?? 0
  const hasPrimary = typeof priceCents === 'number' && priceCents > 0
  const variantCount = optionCount + (hasPrimary && !options?.some((o) => o.priceCents === priceCents) ? 1 : 0)
  if (variantCount > 1) {
    return `from ${formatPrice(min)}`
  }
  return formatPrice(min)
}

type PreviewSource = {
  card: {
    oracleId: string
    name: string
    typeLine?: string | null
    imageUrl?: string | null
  }
  inventoryItem?: InventoryItem | null
  priceCents?: number | null
  inventoryOptions?: InventoryItem[] | null
}

export function buildCardArtPreview(
  row: PreviewSource,
  opts?: { storeSlug?: string },
): CardArtPreview {
  const catalog = row.inventoryItem?.card ?? row.card
  const options = row.inventoryOptions ?? (row.inventoryItem ? [row.inventoryItem] : [])
  const priceCents = cheapestPriceCents(row.priceCents ?? row.inventoryItem?.priceCents, options)

  return {
    oracleId: row.card.oracleId,
    name: row.inventoryItem?.card.name ?? row.card.name,
    typeLine: row.inventoryItem?.card.typeLine ?? row.card.typeLine,
    imageUrl: cardImageUrl(catalog),
    priceCents,
    priceLabel: priceLabelForCard(row.priceCents ?? row.inventoryItem?.priceCents, options),
    inventoryOptions: options,
    storeSlug: opts?.storeSlug,
  }
}

export function buildComboArtPreview(
  piece: {
    name: string
    oracleId?: string | null
    imageUrl?: string | null
    inventoryItem: InventoryItem | null
    inventoryOptions?: InventoryItem[] | null
  },
  opts?: { storeSlug?: string },
): CardArtPreview {
  const catalog = piece.inventoryItem?.card
  const rawUrl = piece.imageUrl ?? catalog?.imageUrl
  const oracleId = piece.oracleId ?? catalog?.oracleId ?? piece.name
  const options = piece.inventoryOptions ?? (piece.inventoryItem ? [piece.inventoryItem] : [])

  return {
    oracleId,
    name: piece.name,
    typeLine: catalog?.typeLine,
    imageUrl: rawUrl ? (catalog ? cardImageUrl(catalog) : cardImageUrl({ imageUrl: rawUrl })) : '',
    priceCents: cheapestPriceCents(piece.inventoryItem?.priceCents, options),
    priceLabel: priceLabelForCard(piece.inventoryItem?.priceCents, options),
    inventoryOptions: options,
    storeSlug: opts?.storeSlug,
  }
}
