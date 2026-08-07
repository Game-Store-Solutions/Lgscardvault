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
