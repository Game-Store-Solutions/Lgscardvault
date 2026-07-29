import type { CardSummary } from '../api/types'

/**
 * Finish (treatment) vocabulary, which belongs to the game — not the platform.
 *
 * "Foil / Nonfoil" is Magic's wording. Pokemon sells Holofoil and Reverse
 * Holofoil, Flesh and Blood sells Rainbow Foil and Cold Foil, One Piece sells
 * plain Foil. Inventory now stores the treatment's name, so a store can hold
 * Holofoil and Reverse Holofoil as separate, separately priced listings.
 *
 * These helpers mirror App\Service\Catalog\FinishVocabulary on the backend —
 * same aliases, same per-game defaults, same foil/not-foil axis, which the
 * card shimmer and market-price lookup still need.
 */

/** Substrings that mark a foil treatment somewhere in the catalog. */
const FOIL_MARKERS = ['foil', 'holo', 'prism', 'rainbow', 'etched', 'shatter', 'galaxy', 'gilded']

/** Names that read as foil-ish but are the plain printing. */
const PLAIN_NAMES = new Set(['normal', 'unlimited', 'unlimited edition', '1st edition'])

export const DEFAULT_PLAIN_FINISH = 'Nonfoil'
export const DEFAULT_FOIL_FINISH = 'Foil'

export function isFoilFinish(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return false
  // "nonfoil" / "non-foil" contain "foil" but mean the opposite.
  if (normalized.startsWith('non')) return false
  if (PLAIN_NAMES.has(normalized)) return false
  return FOIL_MARKERS.some((marker) => normalized.includes(marker))
}

/** Spellings that mean the same treatment — Scryfall's lowercase keys included. */
const ALIASES: Record<string, string> = {
  nonfoil: DEFAULT_PLAIN_FINISH,
  'non-foil': DEFAULT_PLAIN_FINISH,
  'non foil': DEFAULT_PLAIN_FINISH,
  foil: DEFAULT_FOIL_FINISH,
  etched: 'Etched Foil',
  'etched foil': 'Etched Foil',
  regular: 'Normal',
}

/** One spelling per treatment, matching what the backend stores. */
export function finishLabel(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, ' ')
  if (!collapsed) return ''
  return ALIASES[collapsed.toLowerCase()] ?? collapsed
}

/** What each game calls its plain and foil printings when a card doesn't say. */
const GAME_DEFAULTS: Record<string, { plain: string; foil: string }> = {
  mtg: { plain: DEFAULT_PLAIN_FINISH, foil: DEFAULT_FOIL_FINISH },
  pokemon: { plain: 'Normal', foil: 'Holofoil' },
  onepiece: { plain: 'Normal', foil: 'Foil' },
  fab: { plain: 'Normal', foil: 'Rainbow Foil' },
  riftbound: { plain: 'Normal', foil: 'Foil' },
}

type FinishSource = Pick<CardSummary, 'finishes' | 'gameCode'> | null | undefined

export interface FinishOption {
  value: string
  isFoil: boolean
}

/**
 * Every treatment this printing can be stocked as, in catalog order.
 *
 * A card whose treatments were never synced still offers its game's two, so
 * the picker is never empty.
 */
export function finishOptions(card: FinishSource, gameCode?: string): FinishOption[] {
  const defaults = GAME_DEFAULTS[card?.gameCode ?? gameCode ?? 'mtg'] ?? GAME_DEFAULTS.mtg

  const published = (card?.finishes ?? []).map(finishLabel).filter(Boolean)
  const names = published.length > 0 ? published : [defaults.plain, defaults.foil]

  const seen = new Set<string>()
  return names
    .filter((name) => (seen.has(name) ? false : (seen.add(name), true)))
    .map((value) => ({ value, isFoil: isFoilFinish(value) }))
}

export interface FinishChoices {
  /** Label for the plain printing in this game's words. */
  plain: string
  /** Label for the foil printing in this game's words. */
  foil: string
  /** Whether the catalog says this printing exists plain / foil at all. */
  hasPlain: boolean
  hasFoil: boolean
}

/**
 * The two ends of the foil axis for a card, for the places that are still
 * binary: catalog filters, price previews, the shimmer.
 */
export function finishChoices(card: FinishSource, gameCode?: string): FinishChoices {
  const defaults = GAME_DEFAULTS[card?.gameCode ?? gameCode ?? 'mtg'] ?? GAME_DEFAULTS.mtg
  const published = (card?.finishes ?? []).map(finishLabel).filter(Boolean)
  const plainNames = published.filter((name) => !isFoilFinish(name))
  const foilNames = published.filter(isFoilFinish)

  return {
    plain: plainNames[0] ?? defaults.plain,
    foil: foilNames[0] ?? defaults.foil,
    // A card with nothing recorded is treated as printable both ways rather
    // than locked to one — the catalog simply hasn't told us.
    hasPlain: published.length === 0 || plainNames.length > 0,
    hasFoil: published.length === 0 || foilNames.length > 0,
  }
}

/**
 * The finish to show for something already stored. Listings carry their own
 * treatment; the card-derived label is only a fallback for older payloads.
 */
export function finishName(
  card: FinishSource,
  isFoil: boolean,
  stored?: string | null,
  gameCode?: string,
): string {
  const label = finishLabel(stored ?? '')
  if (label) return label

  const choices = finishChoices(card, gameCode)
  return isFoil ? choices.foil : choices.plain
}

/** The treatment a card should default to when it is first picked. */
export function defaultFinishFor(card: FinishSource, gameCode?: string): string {
  return finishOptions(card, gameCode)[0]?.value ?? DEFAULT_PLAIN_FINISH
}
