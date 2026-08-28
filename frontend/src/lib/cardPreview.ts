import { cardImageUrl, formatPrice, scryfallNamedImageUrl, scryfallPriceCents } from '../api/client'
import type { CardSummary, InventoryItem } from '../api/types'
import type { CardArtPreview } from '../components/cards'
import { finishName } from './finishes'

export type CardPrintingSelection = {
  printingId: string
  imageUrl: string
  priceCents: number | null
  priceLabel?: string
  setName?: string | null
}

function marketFinish(card: CardSummary): 'nonfoil' | 'foil' | 'etched' {
  const finishes = card.finishes ?? []
  if (finishes.includes('nonfoil')) return 'nonfoil'
  if (finishes.includes('foil')) return 'foil'
  if (finishes.includes('etched')) return 'etched'
  return 'nonfoil'
}

export function selectionFromCatalogPrinting(card: CardSummary): CardPrintingSelection {
  const priceCents = scryfallPriceCents(card, marketFinish(card))

  return {
    printingId: card.id,
    imageUrl: cardImageUrl(card),
    priceCents,
    priceLabel: priceCents == null ? undefined : formatPrice(priceCents),
    setName: card.setName,
  }
}

export function applyPrintingSelection(
  preview: CardArtPreview,
  selection?: CardPrintingSelection | null,
): CardArtPreview {
  if (!selection) {
    return preview
  }

  return {
    ...preview,
    imageUrl: selection.imageUrl,
    priceCents: selection.priceCents,
    priceLabel: selection.priceLabel,
    catalogCardId: selection.printingId,
    selectedPrintingId: selection.printingId,
  }
}

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
    id?: string
    oracleId: string
    name: string
    typeLine?: string | null
    imageUrl?: string | null
  }
  inventoryItem?: InventoryItem | null
  priceCents?: number | null
  inventoryOptions?: InventoryItem[] | null
}

export type BuildCardArtPreviewOptions = {
  storeSlug?: string
  printingSelection?: CardPrintingSelection | null
}

export function buildCardArtPreview(
  row: PreviewSource,
  opts?: BuildCardArtPreviewOptions,
): CardArtPreview {
  const catalog = row.inventoryItem?.card ?? row.card
  const options = row.inventoryOptions ?? (row.inventoryItem ? [row.inventoryItem] : [])
  const priceCents = cheapestPriceCents(row.priceCents ?? row.inventoryItem?.priceCents, options)

  const base: CardArtPreview = {
    oracleId: row.card.oracleId,
    catalogCardId: row.card.id,
    name: row.inventoryItem?.card.name ?? row.card.name,
    typeLine: row.inventoryItem?.card.typeLine ?? row.card.typeLine,
    imageUrl: cardImageUrl(catalog),
    priceCents,
    priceLabel: priceLabelForCard(row.priceCents ?? row.inventoryItem?.priceCents, options),
    inventoryOptions: options,
    storeSlug: opts?.storeSlug,
  }

  return applyPrintingSelection(base, opts?.printingSelection)
}

type CommanderPreviewSource = {
  id: string
  oracleId: string
  name: string
  typeLine?: string | null
  imageUrl?: string | null
  priceCents?: number | null
  inventoryItem?: InventoryItem | null
  inventoryOptions?: InventoryItem[] | null
}

export function buildCommanderArtPreview(
  commander: CommanderPreviewSource,
  opts?: BuildCardArtPreviewOptions,
): CardArtPreview {
  const oracleId = commander.oracleId || commander.id

  return buildCardArtPreview(
    {
      card: {
        id: commander.id,
        oracleId,
        name: commander.name,
        typeLine: commander.typeLine,
        imageUrl: commander.imageUrl,
      },
      inventoryItem: commander.inventoryItem ?? null,
      inventoryOptions: commander.inventoryOptions,
      priceCents: commander.inventoryItem?.priceCents ?? commander.priceCents,
    },
    opts,
  )
}

export function buildComboArtPreview(
  piece: {
    name: string
    oracleId?: string | null
    imageUrl?: string | null
    inventoryItem: InventoryItem | null
    inventoryOptions?: InventoryItem[] | null
  },
  opts?: BuildCardArtPreviewOptions,
): CardArtPreview {
  const catalog = piece.inventoryItem?.card
  const oracleId = piece.oracleId ?? catalog?.oracleId ?? piece.name
  const options = piece.inventoryOptions ?? (piece.inventoryItem ? [piece.inventoryItem] : [])

  const fromCatalog = catalog ? cardImageUrl(catalog) : ''
  const fromApi = piece.imageUrl ? cardImageUrl({ imageUrl: piece.imageUrl }) : ''
  const imageUrl = fromCatalog || fromApi || scryfallNamedImageUrl(piece.name)

  const base: CardArtPreview = {
    oracleId,
    catalogCardId: catalog?.id,
    name: piece.name,
    typeLine: catalog?.typeLine,
    imageUrl,
    priceCents: cheapestPriceCents(piece.inventoryItem?.priceCents, options),
    priceLabel: priceLabelForCard(piece.inventoryItem?.priceCents, options),
    inventoryOptions: options,
    storeSlug: opts?.storeSlug,
  }

  return applyPrintingSelection(base, opts?.printingSelection)
}

export function resolveCatalogPriceCents(
  _oracleId: string,
  fallbackCents: number | null | undefined,
  printingSelection?: CardPrintingSelection | null,
): number | null {
  if (printingSelection?.priceCents != null) {
    return printingSelection.priceCents
  }
  return fallbackCents ?? null
}

export function computeCatalogDeckTotalCents(
  cards: { card: { oracleId: string }; quantity: number; priceCents?: number | null }[],
  commander: { oracleId: string; priceCents?: number | null } | null | undefined,
  getPrintingSelection: (oracleId: string) => CardPrintingSelection | undefined,
): number | null {
  let total = 0
  let priced = 0

  if (commander) {
    const cents = resolveCatalogPriceCents(
      commander.oracleId,
      commander.priceCents,
      getPrintingSelection(commander.oracleId),
    )
    if (cents != null) {
      total += cents
      priced += 1
    }
  }

  for (const row of cards) {
    const cents = resolveCatalogPriceCents(
      row.card.oracleId,
      row.priceCents,
      getPrintingSelection(row.card.oracleId),
    )
    if (cents == null) {
      continue
    }
    total += cents * Math.max(1, row.quantity)
    priced += 1
  }

  return priced > 0 ? total : null
}
