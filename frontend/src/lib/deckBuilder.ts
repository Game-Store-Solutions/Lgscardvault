import type { CommanderSummary } from '../hooks/useCommanderRecommend'

export type DeckBuilderPanel = 'synergy' | 'combos' | 'deck'
export type DeckBuilderView = 'roles' | 'types'

export interface DeckBuilderNavState {
  from: 'deck-builder'
  commanderId: string
  strategy?: string | null
  panel?: DeckBuilderPanel
  view?: DeckBuilderView
}

export interface DeckBuilderSession {
  commander: CommanderSummary
  strategyId: string | null
  panel: DeckBuilderPanel
  view: DeckBuilderView
}

export function parseDeckBuilderPanel(value: string | null): DeckBuilderPanel {
  return value === 'combos' || value === 'deck' ? value : 'synergy'
}

export function parseDeckBuilderView(value: string | null): DeckBuilderView {
  return value === 'types' ? 'types' : 'roles'
}

/** Storefront URL that reopens a commander package. */
export function deckBuilderPath(
  slug: string,
  opts?: {
    commanderId?: string | null
    strategy?: string | null
    panel?: DeckBuilderPanel
    view?: DeckBuilderView
  },
): string {
  const params = new URLSearchParams()
  if (opts?.commanderId) params.set('commander', opts.commanderId)
  if (opts?.commanderId && opts.strategy) params.set('strategy', opts.strategy)
  if (opts?.commanderId && opts.panel && opts.panel !== 'synergy') params.set('panel', opts.panel)
  if (opts?.commanderId && opts.view && opts.view !== 'roles') params.set('view', opts.view)
  const query = params.toString()
  return query ? `/s/${slug}/deck-builder?${query}` : `/s/${slug}/deck-builder`
}

function storageKey(slug: string) {
  return `lgs.deck-builder.${slug}`
}

export function saveDeckBuilderSession(slug: string, session: DeckBuilderSession | null): void {
  try {
    if (!session) {
      sessionStorage.removeItem(storageKey(slug))
      return
    }
    sessionStorage.setItem(storageKey(slug), JSON.stringify(session))
  } catch {
    // Private mode or quota. URL params still restore the list.
  }
}

export function loadDeckBuilderSession(slug: string): DeckBuilderSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DeckBuilderSession
    if (!parsed?.commander?.id) return null
    return parsed
  } catch {
    return null
  }
}

export function isDeckBuilderNav(
  state: unknown,
): state is DeckBuilderNavState {
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as DeckBuilderNavState).from === 'deck-builder' &&
      typeof (state as DeckBuilderNavState).commanderId === 'string',
  )
}
