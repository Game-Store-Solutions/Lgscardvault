import { scryfallPriceCents } from '../../../api/client'
import type { CardSummary } from '../../../api/types'

export function isPaperRecoveryCard(card: CardSummary): boolean {
  if ((card.gameCode ?? 'mtg') !== 'mtg') return true
  if (card.name.startsWith('A-')) return false
  if (card.collectorNumber && /^A[-.]/i.test(card.collectorNumber)) return false
  const games = card.games
  if (Array.isArray(games) && games.length > 0 && !games.includes('paper')) return false
  return true
}

/**
 * Client-side mirror of StockablePrintingPolicy::storedRejectionReason.
 *
 * Used to avoid pre-selecting the $0 / Alchemy printing that just failed the
 * import. The server is still the authority on Add. Price jobs may still
 * select an unpriced paper printing once the operator types a sell price.
 */
export function isStockableRecoveryCard(
  card: CardSummary,
  finish: 'foil' | 'nonfoil',
): boolean {
  if (!isPaperRecoveryCard(card)) return false
  if ((card.gameCode ?? 'mtg') !== 'mtg') return true
  return (
    (scryfallPriceCents(card, finish) ?? 0) > 0 ||
    (scryfallPriceCents(card, finish === 'foil' ? 'nonfoil' : 'foil') ?? 0) > 0
  )
}
