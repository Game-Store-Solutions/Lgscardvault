import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type {
  CatalogGame,
  CatalogGameSet,
  CatalogSyncRun,
  SealedInventoryLine,
  SealedSearchResult,
} from '../api/types'

/* Multi-game catalog hooks: supported games, their sets, the shared sealed
   catalog, per-store sealed inventory, and platform sync-run history. */

export const catalogGamesKey = ['catalog', 'games'] as const
export const gameSetsKey = (gameCode: string) => ['catalog', 'sets', gameCode] as const
export const sealedSearchKey = (params: SealedSearchParams) =>
  ['catalog', 'sealed', params.game ?? '', params.setId ?? 0, params.q ?? '', params.page ?? 1] as const
export const sealedInventoryKey = (slug: string, game?: string) => ['sealed-inventory', slug, game ?? ''] as const
export const sealedSpotlightKey = (slug: string) => ['sealed-spotlight', slug] as const
export const syncRunsKey = ['catalog', 'sync-runs'] as const

export interface SealedSearchParams {
  game?: string
  setId?: number
  q?: string
  page?: number
  perPage?: number
}

export function useCatalogGames() {
  return useQuery({
    queryKey: catalogGamesKey,
    staleTime: 60 * 60 * 1000, // the game list changes ~never within a session
    queryFn: async () => {
      const { data } = await api.get<CatalogGame[]>('/catalog/games')
      return data
    },
  })
}

export function useGameSets(gameCode: string) {
  return useQuery({
    queryKey: gameSetsKey(gameCode),
    enabled: Boolean(gameCode),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<CatalogGameSet[]>(`/catalog/games/${gameCode}/sets`)
      return data
    },
  })
}

export function useSealedCatalogSearch(params: SealedSearchParams, enabled = true) {
  return useQuery({
    queryKey: sealedSearchKey(params),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<SealedSearchResult>('/catalog/sealed', {
        params: {
          game: params.game || undefined,
          setId: params.setId || undefined,
          q: params.q || undefined,
          page: params.page ?? 1,
          perPage: params.perPage ?? 24,
        },
      })
      return data
    },
  })
}

/** Staff view: every sealed line for the store (including sold out). */
export function useStoreSealedInventory(slug: string, game?: string) {
  return useQuery({
    queryKey: sealedInventoryKey(slug, game),
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<SealedInventoryLine[]>(`/stores/${slug}/sealed-inventory`, {
        params: { game: game || undefined },
      })
      return data
    },
  })
}

/** Storefront: freshest in-stock sealed lines for the spotlight row. */
export function useSealedSpotlight(slug: string) {
  return useQuery({
    queryKey: sealedSpotlightKey(slug),
    enabled: Boolean(slug),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<SealedInventoryLine[]>(`/stores/${slug}/sealed/spotlight`)
      return data
    },
  })
}

/** Platform admin: recent catalog sync runs (auto-refreshes while one is running). */
export function useCatalogSyncRuns() {
  return useQuery({
    queryKey: syncRunsKey,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => run.status === 'running') ? 5_000 : 30_000,
    queryFn: async () => {
      const { data } = await api.get<CatalogSyncRun[]>('/admin/catalog/sync-runs')
      return data
    },
  })
}
