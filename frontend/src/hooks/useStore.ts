import { useQuery } from '@tanstack/react-query'
import api, { unwrapCollection } from '../api/client'
import type { Store } from '../api/types'

export const activeStoresKey = ['stores'] as const

/** Public list of active marketplace stores (`GET /stores`). */
export function useActiveStores(enabled = true) {
  return useQuery({
    queryKey: activeStoresKey,
    queryFn: async () => {
      const { data } = await api.get('/stores')
      return unwrapCollection<Store>(data)
    },
    enabled,
  })
}

/**
 * useStore — fetch a single store by slug.
 * Matches the existing pages' query key (['store', slug]) and endpoint.
 * Disabled until a slug is provided.
 */
export function useStore(slug?: string) {
  return useQuery({
    queryKey: ['store', slug],
    queryFn: async () => {
      const { data } = await api.get<Store>(`/stores/${slug}`)
      return data
    },
    enabled: !!slug,
    // Store branding/settings rarely change while browsing — avoid refetching it
    // on every store-scoped page navigation.
    staleTime: 5 * 60 * 1000,
  })
}

export default useStore
