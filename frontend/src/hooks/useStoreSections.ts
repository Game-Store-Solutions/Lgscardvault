import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { PullSheet, StockingSheet, StoreCaseSummary, StoreSection } from '../api/types'

export const storeCasesKey = (slug: string) => ['store-cases', slug] as const
export const storeSectionsKey = (slug: string) => ['store-sections', slug] as const

const pullSheetKey = (slug: string, scope: number | 'all') => ['pull-sheet', slug, scope] as const

export function useStoreCases(slug?: string) {
  return useQuery({
    queryKey: storeCasesKey(slug ?? ''),
    enabled: Boolean(slug),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await api.get<StoreCaseSummary[]>(`/stores/${slug}/cases`)
      return data
    },
  })
}

export function useStoreSections(slug?: string) {
  return useQuery({
    queryKey: storeSectionsKey(slug ?? ''),
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreSection[]>(`/stores/${slug}/sections`)
      return data
    },
  })
}

export function usePullSheet(slug: string, sectionId: number | null) {
  return useQuery({
    queryKey: pullSheetKey(slug, sectionId ?? 0),
    enabled: Boolean(slug) && null !== sectionId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await api.get<PullSheet>(`/stores/${slug}/sections/${sectionId}/pull-sheet`)
      return data
    },
  })
}

export function useStorePullSheet(slug: string) {
  return useQuery({
    queryKey: pullSheetKey(slug, 'all'),
    enabled: Boolean(slug),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await api.get<PullSheet>(`/stores/${slug}/cases/pull-sheet`)
      return data
    },
  })
}

export function useStockingSheet(slug: string, sectionId: number | null) {
  return useQuery({
    queryKey: ['stocking-sheet', slug, sectionId] as const,
    enabled: Boolean(slug) && null !== sectionId,
    queryFn: async () => {
      const { data } = await api.get<StockingSheet>(`/stores/${slug}/sections/${sectionId}/stocking-sheet`)
      return data
    },
  })
}

export default useStoreSections
