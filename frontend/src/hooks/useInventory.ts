import { keepPreviousData, useQuery } from '@tanstack/react-query'
import api, { unwrapCollection } from '../api/client'
import type { InventoryItem } from '../api/types'

export type InventoryQueryOptions = {
  /** Public storefront: only listings with quantity > 0. Admin omits this. */
  inStockOnly?: boolean
  /** Scope to one game so a Magic workspace never downloads Pokémon. */
  game?: string
  /** Extra gate — e.g. wait until the game switcher has a selection. */
  enabled?: boolean
}

export type InventoryPageFilters = {
  q?: string
  set?: string
  artist?: string
  type?: string
  finish?: 'all' | 'foil' | 'nonfoil'
  colors?: string
  minPriceCents?: number | null
  maxPriceCents?: number | null
  sort?: string
  inStockOnly?: boolean
  game?: string
  page?: number
  itemsPerPage?: number
  enabled?: boolean
}

export interface InventoryPage {
  items: InventoryItem[]
  total: number
  page: number
  itemsPerPage: number
}

/** React Query key for a store's inventory — shared by the hook and invalidations. */
export const inventoryKey = (slug: string, opts?: InventoryQueryOptions) =>
  opts
    ? (['inventory', slug, opts.inStockOnly ? 'in-stock' : 'all', opts.game || 'any-game'] as const)
    : (['inventory', slug] as const)

/** Prefix for one-page catalog queries (storefront + admin grid). */
export const inventoryPageKey = (slug: string) => ['inventory-page', slug] as const

/** Server page size — must not exceed the API's itemsPerPage cap (500). */
const PAGE_SIZE = 500
/** Hard stop so a misbehaving server can never loop us forever (500 × 400 = 200k items). */
const MAX_PAGES = 400

function sortInventory(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => a.card.name.localeCompare(b.card.name) || a.id - b.id)
}

export function parseInventoryPage(data: unknown, page: number, itemsPerPage: number): InventoryPage {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page, itemsPerPage }
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  if (!record) {
    return { items: [], total: 0, page, itemsPerPage }
  }

  const items = Array.isArray(record.items)
    ? (record.items as InventoryItem[])
    : unwrapCollection(data as InventoryItem[] | { member?: InventoryItem[] })

  const meta = record.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : null
  const totalRaw =
    record.totalItems ??
    record['hydra:totalItems'] ??
    record.total ??
    meta?.totalItems

  const total =
    totalRaw !== undefined && totalRaw !== null && totalRaw !== ''
      ? Math.max(0, Number(totalRaw) || 0)
      : items.length

  return {
    items,
    total,
    page: Math.max(1, Number(record.page ?? page) || page),
    itemsPerPage: Math.max(1, Number(record.itemsPerPage ?? itemsPerPage) || itemsPerPage),
  }
}

/**
 * One page of inventory from the server — the storefront and admin grids
 * should use this. Changing filters/page hits SQL, not an 18k-row download.
 */
export function useInventoryPage(slug: string, filters: InventoryPageFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const itemsPerPage = Math.max(1, filters.itemsPerPage ?? 24)
  const game = filters.game?.trim() || undefined
  const inStockOnly = Boolean(filters.inStockOnly)

  return useQuery({
    queryKey: [
      ...inventoryPageKey(slug),
      inStockOnly ? 'in-stock' : 'all',
      game ?? '',
      page,
      itemsPerPage,
      filters.q ?? '',
      filters.set ?? '',
      filters.artist ?? '',
      filters.type ?? '',
      filters.finish ?? 'all',
      filters.colors ?? '',
      filters.minPriceCents ?? '',
      filters.maxPriceCents ?? '',
      filters.sort ?? 'name',
    ],
    enabled: (filters.enabled ?? true) && Boolean(slug),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await api.get(`/stores/${slug}/inventory`, {
        params: catalogRequestParams(filters, page, itemsPerPage),
      })
      return parseInventoryPage(data, page, itemsPerPage)
    },
  })
}

function catalogRequestParams(filters: InventoryPageFilters, page: number, itemsPerPage: number) {
  const game = filters.game?.trim() || undefined
  const inStockOnly = Boolean(filters.inStockOnly)

  return {
    page,
    itemsPerPage,
    ...(inStockOnly ? { inStockOnly: 1 } : {}),
    ...(game ? { game } : {}),
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.set?.trim() ? { set: filters.set.trim() } : {}),
    ...(filters.artist?.trim() ? { artist: filters.artist.trim() } : {}),
    ...(filters.type?.trim() ? { type: filters.type.trim() } : {}),
    ...(filters.finish && filters.finish !== 'all' ? { finish: filters.finish } : {}),
    ...(filters.colors ? { colors: filters.colors } : {}),
    ...(filters.minPriceCents != null ? { minPriceCents: filters.minPriceCents } : {}),
    ...(filters.maxPriceCents != null ? { maxPriceCents: filters.maxPriceCents } : {}),
    ...(filters.sort && filters.sort !== 'name' ? { sort: filters.sort } : {}),
  }
}

/**
 * Every listing that matches the catalog filters. Walks SQL pages of the
 * filtered set (never the whole store) so artist/set browse stays one or two
 * requests even when the store has tens of thousands of singles.
 */
export function useInventoryCatalog(slug: string, filters: InventoryPageFilters) {
  const game = filters.game?.trim() || undefined
  const inStockOnly = Boolean(filters.inStockOnly)
  const itemsPerPage = Math.min(PAGE_SIZE, Math.max(1, filters.itemsPerPage ?? PAGE_SIZE))

  return useQuery({
    queryKey: [
      ...inventoryPageKey(slug),
      'catalog-all',
      inStockOnly ? 'in-stock' : 'all',
      game ?? '',
      itemsPerPage,
      filters.q ?? '',
      filters.set ?? '',
      filters.artist ?? '',
      filters.type ?? '',
      filters.finish ?? 'all',
      filters.colors ?? '',
      filters.minPriceCents ?? '',
      filters.maxPriceCents ?? '',
      filters.sort ?? 'name',
    ],
    enabled: (filters.enabled ?? true) && Boolean(slug),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const seen = new Map<number, InventoryItem>()
      let page = 1
      let total = Number.POSITIVE_INFINITY
      for (let n = 0; n < MAX_PAGES && seen.size < total; n++) {
        const { data } = await api.get(`/stores/${slug}/inventory`, {
          params: catalogRequestParams(filters, page, itemsPerPage),
        })
        const parsed = parseInventoryPage(data, page, itemsPerPage)
        total = parsed.total
        for (const item of parsed.items) {
          seen.set(item.id, item)
        }
        if (parsed.items.length < itemsPerPage) {
          break
        }
        page += 1
      }

      return sortInventory([...seen.values()])
    },
  })
}

/**
 * Full-catalog walk for tools that still need every row (case cards).
 * Storefront grids should use useInventoryPage; mass search posts names
 * to /inventory/mass-search instead of downloading the shelf.
 */
export function useInventory(slug: string, opts?: InventoryQueryOptions) {
  const inStockOnly = Boolean(opts?.inStockOnly)
  const game = opts?.game?.trim() || undefined
  const key = inventoryKey(slug, { inStockOnly, game })

  return useQuery({
    queryKey: key,
    enabled: (opts?.enabled ?? true) && Boolean(slug),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const seen = new Map<number, InventoryItem>()
      let afterId = 0
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data } = await api.get(`/stores/${slug}/inventory`, {
          params: {
            afterId,
            itemsPerPage: PAGE_SIZE,
            ...(inStockOnly ? { inStockOnly: 1 } : {}),
            ...(game ? { game } : {}),
          },
        })
        const chunk = unwrapCollection<InventoryItem>(data)
        for (const item of chunk) {
          seen.set(item.id, item)
          if (item.id > afterId) afterId = item.id
        }
        if (chunk.length < PAGE_SIZE) break
      }

      return sortInventory([...seen.values()])
    },
  })
}

/** Cap shared with the mass-search API so a pasted cube cannot overflow the request. */
export const MASS_SEARCH_MAX_NAMES = 400

/**
 * In-stock listings matching the given card names (exact + DFC front face).
 * One round trip — do not use useInventory() to pre-load the catalog for this.
 */
export async function searchInventoryByNames(slug: string, names: string[]): Promise<InventoryItem[]> {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  if (!slug || unique.length === 0) {
    return []
  }

  const { data } = await api.post(`/stores/${slug}/inventory/mass-search`, {
    names: unique.slice(0, MASS_SEARCH_MAX_NAMES),
  })

  return unwrapCollection<InventoryItem>(data)
}

export default useInventory
