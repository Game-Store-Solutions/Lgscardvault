import type { CardSummary } from '../api/types'

/**
 * Finish (treatment) vocabulary, which belongs to the game — not the platform.
 *
 * "Foil / Nonfoil" is Magic's wording. Pokemon sells Holofoil and Reverse
 * Holofoil, Flesh and Blood sells Rainbow Foil and Cold Foil, One Piece sells
 * plain Foil. The catalog sync records whatever names TCGplayer publishes on
 * `card.finishes`, and these helpers turn those into the labels the picker
 * shows, so a store never sees Magic's words on a Pokemon card.
 *
 * Storage is still the binary isFoil flag, so the picker offers one plain and
 * one foil choice; treatments beyond those two are surfaced as a note rather
 * than pretended to be separately stockable.
 */

/** Substrings that mark a foil treatment somewhere in the catalog. */
const FOIL_MARKERS = ['foil', 'holo', 'prism', 'rainbow', 'etched', 'shatter', 'galaxy', 'gilded']

/** Names that read as foil-ish but are the plain printing. */
const PLAIN_NAMES = new Set(['normal', 'unlimited', 'unlimited edition', '1st edition'])

export function isFoilFinish(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return false
  // "nonfoil" / "non-foil" contain "foil" but mean the opposite.
  if (normalized.startsWith('non')) return false
  if (PLAIN_NAMES.has(normalized)) return false
  return FOIL_MARKERS.some((marker) => normalized.includes(marker))
}

/** Scryfall ships lowercase keys; every other source already ships prose. */
const SCRYFALL_LABELS: Record<string, string> = {
  nonfoil: 'Nonfoil',
  foil: 'Foil',
  etched: 'Etched Foil',
  glossy: 'Glossy',
}

export function finishLabel(name: string): string {
  const trimmed = name.trim()
  return SCRYFALL_LABELS[trimmed.toLowerCase()] ?? trimmed
}

/** What each game calls its plain and foil printings when a card doesn't say. */
const GAME_DEFAULTS: Record<string, { plain: string; foil: string }> = {
  mtg: { plain: 'Nonfoil', foil: 'Foil' },
  pokemon: { plain: 'Normal', foil: 'Holofoil' },
  onepiece: { plain: 'Normal', foil: 'Foil' },
  fab: { plain: 'Normal', foil: 'Rainbow Foil' },
  riftbound: { plain: 'Normal', foil: 'Foil' },
}

export interface FinishChoices {
  /** Label for the plain printing in this game's words. */
  plain: string
  /** Label for the foil printing in this game's words. */
  foil: string
  /** Treatments this printing has beyond the two selectable ones. */
  extras: string[]
  /** Whether the catalog says this printing exists plain / foil at all. */
  hasPlain: boolean
  hasFoil: boolean
}

type FinishSource = Pick<CardSummary, 'finishes' | 'gameCode'> | null | undefined

/**
 * The finish labels to show for a card. `gameCode` is the fallback for cards
 * that don't carry one (legacy Magic rows) and for empty pickers.
 */
export function finishChoices(card: FinishSource, gameCode?: string): FinishChoices {
  const code = card?.gameCode ?? gameCode ?? 'mtg'
  const defaults = GAME_DEFAULTS[code] ?? GAME_DEFAULTS.mtg

  const published = (card?.finishes ?? []).map(finishLabel).filter(Boolean)
  const plainNames = published.filter((name) => !isFoilFinish(name))
  const foilNames = published.filter(isFoilFinish)

  return {
    plain: plainNames[0] ?? defaults.plain,
    foil: foilNames[0] ?? defaults.foil,
    extras: [...plainNames.slice(1), ...foilNames.slice(1)],
    // A card with nothing recorded is treated as printable both ways rather
    // than locked to one — the catalog simply hasn't told us.
    hasPlain: published.length === 0 || plainNames.length > 0,
    hasFoil: published.length === 0 || foilNames.length > 0,
  }
}

/** The single label for a listing that is already stored as foil / not foil. */
export function finishName(card: FinishSource, isFoil: boolean, gameCode?: string): string {
  const choices = finishChoices(card, gameCode)
  return isFoil ? choices.foil : choices.plain
}
