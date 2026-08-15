import { useQuery } from '@tanstack/react-query'
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

/** React Query key for a store's inventory — shared by the hook and invalidations. */
export const inventoryKey = (slug: string, opts?: InventoryQueryOptions) =>
  opts
    ? (['inventory', slug, opts.inStockOnly ? 'in-stock' : 'all', opts.game || 'any-game'] as const)
    : (['inventory', slug] as const)

/** Server page size — must not exceed the API's itemsPerPage cap (500). */
const PAGE_SIZE = 500
/** Hard stop so a misbehaving server can never loop us forever (500 × 400 = 200k items). */
const MAX_PAGES = 400

function sortInventory(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => a.card.name.localeCompare(b.card.name) || a.id - b.id)
}

/**
 * useInventory — fetch a store's inventory listing. The API serves keyset
 * pages (`?afterId=`); this hook walks them. The first page is published into
 * the cache immediately so the storefront and admin inventory can paint
 * instead of waiting on an 18k-row walk.
 */
export function useInventory(slug: string, opts?: InventoryQueryOptions) {
  const inStockOnly = Boolean(opts?.inStockOnly)
  const game = opts?.game?.trim() || undefined
  const key = inventoryKey(slug, { inStockOnly, game })

  return useQuery({
    queryKey: key,
    enabled: (opts?.enabled ?? true) && Boolean(slug),
    staleTime: 30 * 1000,
    queryFn: async ({ client }) => {
      const seen = new Map<number, InventoryItem>()
      let afterId = 0
      const publish = () => {
        client.setQueryData(key, sortInventory([...seen.values()]))
      }

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
        if (seen.size > 0) publish()
        if (chunk.length < PAGE_SIZE) break
      }

      return sortInventory([...seen.values()])
    },
  })
}

export default useInventory
