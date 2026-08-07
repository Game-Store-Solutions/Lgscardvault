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
  inventoryItem: InventoryItem | null
}

export interface SpellbookCombo {
  id: string
  description: string
  status: string
  produces: string[]
  cards: SpellbookComboCard[]
  inStockCount: number
  missingCount: number
  missing: string[]
  completeInStore: boolean
}

export interface CommanderCombosResponse {
  commander: string
  combos: SpellbookCombo[]
  source: string
}

export interface AssembledDeckCard {
  slot: string
  score: number
  inventoryItem: InventoryItem
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
  inventoryIds: number[]
}

export interface CommanderRecommendation {
  score: number
  reasons: string[]
  inventoryItem: InventoryItem
}

export interface CommanderRecommendResponse {
  commander: CommanderSummary & { themes?: string[] }
  colorIdentity: string[]
  identityCode: string
  totalCandidates: number
  recommendations: CommanderRecommendation[]
}

export function commanderSearchKey(slug: string, q: string) {
  return ['commander-search', slug, q] as const
}

export function commanderRecommendKey(slug: string, cardId: string) {
  return ['commander-recommend', slug, cardId] as const
}

/** Typeahead for legendary creature commanders at a store. */
export function useCommanderSearch(slug: string, query: string, enabled = true) {
  const debounced = useDebouncedValue(query.trim(), 250)
  return useQuery({
    queryKey: commanderSearchKey(slug, debounced),
    queryFn: async () => {
      const { data } = await api.get<CommanderSummary[]>(`/stores/${slug}/recommend/commanders`, {
        params: { q: debounced, limit: 12 },
      })
      return data
    },
    enabled: enabled && Boolean(slug) && debounced.length >= 2,
  })
}

/** In-stock synergies for a selected commander printing. */
export function useCommanderRecommendations(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderRecommendKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<CommanderRecommendResponse>(
        `/stores/${slug}/recommend/commander/${cardId}`,
        { params: { limit: 36 } },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

export function commanderCombosKey(slug: string, cardId: string) {
  return ['commander-combos', slug, cardId] as const
}

export function commanderDeckKey(slug: string, cardId: string) {
  return ['commander-deck', slug, cardId] as const
}

/** Spellbook combos for a commander, intersected with this store's stock. */
export function useCommanderCombos(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderCombosKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<CommanderCombosResponse>(
        `/stores/${slug}/recommend/commander/${cardId}/combos`,
        { params: { limit: 16 } },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

/** ~100-card deck assembled from store stock + synergy + combo packages. */
export function useCommanderDeck(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderDeckKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<AssembledDeckResponse>(
        `/stores/${slug}/recommend/commander/${cardId}/deck`,
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}
