import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type {
  StoreGame,
  CatalogGame,
  CatalogGameSet,
  CatalogGameShowcase,
  CatalogShowcaseCard,
  CatalogSyncRun,
  CatalogArtistBrowseResult,
  SealedInventoryLine,
  SealedSearchResult,
  SealedSpotlight,
  StoreGameStats,
  StoreGameShelf,
  ScryfallSyncRun,
} from '../api/types'

/* Multi-game catalog hooks: supported games, their sets, the shared sealed
   catalog, per-store sealed inventory, and platform sync-run history. */

export const catalogGamesKey = ['catalog', 'games'] as const
export const catalogGamesShowcaseKey = ['catalog', 'games', 'showcase'] as const
export const catalogShowcaseCardsKey = ['catalog', 'showcase-cards'] as const
export const gameSetsKey = (gameCode: string) => ['catalog', 'sets', gameCode] as const
export const sealedSearchKey = (params: SealedSearchParams) =>
  ['catalog', 'sealed', params.game ?? '', params.setId ?? 0, params.q ?? '', params.page ?? 1] as const
export const sealedInventoryKey = (slug: string, game?: string) => ['sealed-inventory', slug, game ?? ''] as const
export const sealedPublicKey = (slug: string, game?: string) => ['sealed-public', slug, game ?? ''] as const
export const sealedSpotlightKey = (slug: string) => ['sealed-spotlight', slug] as const
export const syncRunsKey = ['catalog', 'sync-runs'] as const
export const scryfallSyncRunsKey = ['scryfall', 'sync-runs'] as const
export const storeGamesKey = (slug: string) => ['store-games', slug] as const
export const storeGameStatsKey = (slug: string, game: string) => ['store-game-stats', slug, game] as const
export const storeGameShelfKey = (slug: string, game: string) => ['store-game-shelf', slug, game] as const
export const catalogByArtistKey = (artist: string, game: string, offset: number, limit: number) =>
  ['catalog', 'by-artist', artist, game, offset, limit] as const

export interface SealedSearchParams {
  game?: string
  setId?: number
  q?: string
  page?: number
  perPage?: number
}

/**
 * Supported games with a representative card image pulled from the catalog.
 * Public endpoint — the landing page uses it for the "games we support" tiles.
 */
export function useGameShowcase() {
  return useQuery({
    queryKey: catalogGamesShowcaseKey,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<CatalogGameShowcase[]>('/catalog/games/showcase')
      return data
    },
  })
}

/**
 * Card art for the marketing background. The server rotates the selection once
 * a day, so this can cache hard — a refresh should not reshuffle the hero.
 */
export function useShowcaseCards(limit = 24) {
  return useQuery({
    queryKey: [...catalogShowcaseCardsKey, limit],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<CatalogShowcaseCard[]>('/catalog/showcase-cards', {
        params: { limit },
      })
      return data.filter((card) => Boolean(card.imageUrl))
    },
  })
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

/**
 * Games this store actually stocks. The storefront switcher is built from
 * this rather than the platform game list, so shoppers are never offered a
 * tab that leads to an empty shelf.
 */
export function useStoreGames(slug: string) {
  return useQuery({
    queryKey: storeGamesKey(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<StoreGame[]>(`/stores/${slug}/games`)
      return data
    },
  })
}

/**
 * Inventory numbers for the selected game. These live on the page rather
 * than on the nav: one number per pill can't express singles vs sealed, and
 * a bare count next to a game name reads as "results", not "stock".
 */
export function useStoreGameStats(slug: string, gameCode: string) {
  return useQuery({
    queryKey: storeGameStatsKey(slug, gameCode),
    enabled: Boolean(slug && gameCode),
    queryFn: async () => {
      const { data } = await api.get<StoreGameStats>(`/stores/${slug}/games/${gameCode}/stats`)
      return data
    },
  })
}

/** In-stock listing counts and sets for the public storefront. */
export function useStoreGameShelf(slug: string, gameCode: string) {
  return useQuery({
    queryKey: storeGameShelfKey(slug, gameCode),
    enabled: Boolean(slug && gameCode),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<StoreGameShelf>(`/stores/${slug}/games/${gameCode}/shelf`)
      return data
    },
  })
}

/** Catalog printings for an exact artist name (local DB). */
export function useCatalogByArtist(artist: string, gameCode: string, offset: number, limit: number) {
  return useQuery({
    queryKey: catalogByArtistKey(artist, gameCode, offset, limit),
    enabled: Boolean(artist),
    queryFn: async () => {
      const { data } = await api.get<CatalogArtistBrowseResult>('/catalog/by-artist', {
        params: { artist, game: gameCode, offset, limit },
      })
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

/** Storefront: every in-stock sealed line, optionally one game. */
export function useStoreSealedPublic(slug: string, gameCode?: string) {
  return useQuery({
    queryKey: sealedPublicKey(slug, gameCode),
    enabled: Boolean(slug),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<SealedInventoryLine[]>(`/stores/${slug}/sealed`, {
        params: { game: gameCode || undefined },
      })
      return data
    },
  })
}

/** Storefront: freshest in-stock sealed lines for the spotlight row. */
export function useSealedSpotlight(slug: string, gameCode?: string) {
  return useQuery({
    queryKey: [...sealedSpotlightKey(slug), gameCode ?? ''],
    enabled: Boolean(slug),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<SealedSpotlight>(`/stores/${slug}/sealed/spotlight`, {
        params: { game: gameCode || undefined },
      })
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

/** Platform admin: Scryfall bulk sync history (auto-refreshes while active). */
export function useScryfallSyncRuns() {
  return useQuery({
    queryKey: scryfallSyncRunsKey,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => run.status === 'queued' || run.status === 'running')
        ? 5_000
        : 30_000,
    queryFn: async () => {
      const { data } = await api.get<ScryfallSyncRun[]>('/admin/scryfall/sync-runs')
      return data
    },
  })
}
