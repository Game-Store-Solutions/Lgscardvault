import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { InventoryItem } from '../api/types'
import { useDebouncedValue } from './useDebouncedValue'

export interface CommanderSummary {
  id: string
  oracleId: string
  name: string
  typeLine?: string | null
  manaCost?: string | null
  cmc?: number | null
  colorIdentity?: string[]
  imageUrl?: string | null
  setCode?: string
  setName?: string | null
}

export interface SpellbookComboCard {
  name: string
  quantity: number
  inStock: boolean
  isCommander?: boolean
  stockQuantity?: number
  colorIdentity?: string[]
  recommendedColors?: string[]
  inventoryItem: InventoryItem | null
}

export interface SpellbookCombo {
  id: string
  description: string
  status: string
  produces: string[]
  cards: SpellbookComboCard[]
  pieceCount?: number
  inStockCount: number
  missingCount: number
  missing: string[]
  completeInStore: boolean
  coverage?: number
}

export interface CommanderCombosResponse {
  commander: string
  colorIdentity?: string[]
  identityCode?: string
  legalColors?: string[]
  filteredOutCount?: number
  combos: SpellbookCombo[]
  source: string
}

export interface AssembledDeckCard {
  slot: string
  score: number
  gameChanger?: boolean
  priceCents?: number
  inventoryItem: InventoryItem
}

export interface AssembledDeckBudget {
  limitCents: number | null
  maxCardCents: number | null
  spentCents: number
  remainingCents: number | null
}

export interface AssembledDeckBracket {
  requested: number | null
  applied: number
  label: string
  auto: boolean
  maxGameChangers: number | null
  gameChangersInStock: { name: string; oracleId: string; priceCents: number }[]
  gameChangersIncluded: { name: string; oracleId: string; slot: string; priceCents: number }[]
  accommodated: boolean
}

export interface AssembledDeckResponse {
  commander: CommanderSummary & { themes?: string[] }
  identityCode: string
  targetSize: number
  filledSize: number
  slots: Record<string, number>
  gaps: string[]
  cards: AssembledDeckCard[]
  combos: SpellbookCombo[]
  budget: AssembledDeckBudget
  bracket: AssembledDeckBracket
  inventoryIds: number[]
}

export type DeckRole = 'enabler' | 'fuel' | 'payoff' | 'support'
export type DeckCardType =
  | 'creature'
  | 'enchantment'
  | 'instant'
  | 'sorcery'
  | 'artifact'
  | 'land'
  | 'planeswalker'
  | 'other'

export interface CommanderStrategy {
  id: string
  label: string
  description: string
  confidence: number
  matchedSignals: string[]
}

export interface CommanderRecommendation {
  score: number
  role: DeckRole
  roles: DeckRole[]
  cardType: DeckCardType
  reasons: string[]
  inventoryItem: InventoryItem
}

export interface CommanderRecommendResponse {
  commander: CommanderSummary & { themes?: string[] }
  colorIdentity: string[]
  identityCode: string
  strategies: CommanderStrategy[]
  strategy: Pick<CommanderStrategy, 'id' | 'label' | 'description'>
  totalCandidates: number
  recommendations: CommanderRecommendation[]
  byRole: Record<DeckRole, CommanderRecommendation[]>
  byType: Record<DeckCardType, CommanderRecommendation[]>
}

export function commanderSearchKey(slug: string, q: string) {
  return ['commander-search', slug, q] as const
}

export function commanderStrategiesKey(slug: string, cardId: string) {
  return ['commander-strategies', slug, cardId] as const
}

export function commanderRecommendKey(slug: string, cardId: string, strategy = '') {
  return ['commander-recommend', slug, cardId, strategy] as const
}

/** Typeahead for legendary creature commanders at a store. */
export function useCommanderSearch(slug: string, query: string, enabled = true) {
  const debounced = useDebouncedValue(query.trim(), 250)
  return useQuery({
    queryKey: commanderSearchKey(slug, debounced),
    queryFn: async () => {
      const { data } = await api.get<CommanderSummary[]>(`/stores/${slug}/recommend/commanders`, {
        params: { q: debounced, limit: 24 },
      })
      return data
    },
    enabled: enabled && Boolean(slug) && debounced.length >= 2,
  })
}

/** Strategies this commander supports (for the picker). */
export function useCommanderStrategies(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderStrategiesKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<{ strategies: CommanderStrategy[] }>(
        `/stores/${slug}/recommend/commander/${cardId}/strategies`,
      )
      return data.strategies
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

/** Strategy-scoped in-stock deck package for a selected commander. */
export function useCommanderRecommendations(
  slug: string,
  cardId: string | null,
  strategy: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: commanderRecommendKey(slug, cardId ?? '', strategy ?? ''),
    queryFn: async () => {
      const { data } = await api.get<CommanderRecommendResponse>(
        `/stores/${slug}/recommend/commander/${cardId}`,
        { params: { strategy: strategy || undefined, limit: 80 } },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId) && Boolean(strategy),
  })
}

export function commanderCombosKey(slug: string, cardId: string) {
  return ['commander-combos', slug, cardId] as const
}

export function commanderDeckKey(
  slug: string,
  cardId: string,
  budgetCents: number | null = null,
  maxCardCents: number | null = null,
  bracket = 'auto',
) {
  return ['commander-deck', slug, cardId, budgetCents, maxCardCents, bracket] as const
}

/** Spellbook combos for a commander, intersected with this store's stock. */
export function useCommanderCombos(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderCombosKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<CommanderCombosResponse>(
        `/stores/${slug}/recommend/commander/${cardId}/combos`,
        { params: { limit: 24 } },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

/** ~100-card deck assembled from store stock + synergy + combo packages. */
export function useCommanderDeck(
  slug: string,
  cardId: string | null,
  enabled = true,
  opts?: { budgetCents?: number | null; maxCardCents?: number | null; bracket?: string },
) {
  const budgetCents = opts?.budgetCents ?? null
  const maxCardCents = opts?.maxCardCents ?? null
  const bracket = opts?.bracket && opts.bracket !== 'auto' ? opts.bracket : 'auto'
  return useQuery({
    queryKey: commanderDeckKey(slug, cardId ?? '', budgetCents, maxCardCents, bracket),
    queryFn: async () => {
      const { data } = await api.get<AssembledDeckResponse>(
        `/stores/${slug}/recommend/commander/${cardId}/deck`,
        {
          params: {
            budgetCents: budgetCents ?? undefined,
            maxCardCents: maxCardCents ?? undefined,
            bracket: bracket === 'auto' ? undefined : bracket,
          },
        },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}
