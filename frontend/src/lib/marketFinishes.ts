import type { CardSummary } from '../api/types'
import { formatPrice, strictScryfallPriceCents } from '../api/client'
import { finishChoices, finishName } from './finishes'

export type MarketFinishKey = 'nonfoil' | 'foil' | 'etched'

export const MARKET_NOT_PRINTED = 'Not printed'
export const MARKET_NO_DATA = 'No market data'

function scryfallFinishKeys(card: CardSummary): Set<string> {
  return new Set((card.finishes ?? []).map((finish) => finish.trim().toLowerCase()))
}

/** True when the catalog recorded Scryfall-style finish keys on this printing. */
function hasScryfallFinishList(card: CardSummary): boolean {
  const keys = scryfallFinishKeys(card)
  return keys.has('nonfoil') || keys.has('foil') || keys.has('etched')
}

/** Whether this printing is published in the given finish (no guessing from price fallbacks). */
export function offersMarketFinish(card: CardSummary, key: MarketFinishKey): boolean {
  const keys = scryfallFinishKeys(card)
  if (hasScryfallFinishList(card)) {
    return keys.has(key)
  }
  const { hasPlain, hasFoil } = finishChoices(card)
  if (key === 'nonfoil') return hasPlain
  if (key === 'foil') return hasFoil
  return false
}

export function marketKeyForListing(isFoil: boolean, storedFinish?: string | null): MarketFinishKey {
  const normalized = (storedFinish ?? '').trim().toLowerCase()
  if (normalized.includes('etched')) return 'etched'
  if (isFoil) return 'foil'
  return 'nonfoil'
}

export interface MarketFinishRow {
  key: MarketFinishKey
  label: string
  exists: boolean
  priceCents: number | null
  display: string
  muted: boolean
}

function marketDisplay(card: CardSummary, key: MarketFinishKey): Pick<MarketFinishRow, 'exists' | 'priceCents' | 'display' | 'muted'> {
  const exists = offersMarketFinish(card, key)
  if (!exists) {
    return { exists: false, priceCents: null, display: MARKET_NOT_PRINTED, muted: true }
  }
  const priceCents = strictScryfallPriceCents(card, key)
  if (priceCents === null) {
    return { exists: true, priceCents: null, display: MARKET_NO_DATA, muted: true }
  }
  return { exists: true, priceCents, display: formatPrice(priceCents), muted: false }
}

/** Rows for market snapshot / comparison — etched omitted when not published. */
export function buildMarketFinishRows(card: CardSummary): MarketFinishRow[] {
  const rows: MarketFinishRow[] = [
    { key: 'nonfoil', label: finishName(card, false), ...marketDisplay(card, 'nonfoil') },
    { key: 'foil', label: finishName(card, true), ...marketDisplay(card, 'foil') },
  ]
  if (offersMarketFinish(card, 'etched')) {
    rows.push({ key: 'etched', label: 'Etched', ...marketDisplay(card, 'etched') })
  }
  return rows
}

export function listingMarketSummary(
  card: CardSummary,
  isFoil: boolean,
  storedFinish?: string | null,
): { key: MarketFinishKey; display: string; priceCents: number | null } {
  const key = marketKeyForListing(isFoil, storedFinish)
  const { display, priceCents, exists } = marketDisplay(card, key)
  if (!exists) {
    return { key, display: MARKET_NOT_PRINTED, priceCents: null }
  }
  return { key, display, priceCents }
}
