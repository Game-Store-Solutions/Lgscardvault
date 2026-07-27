import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { PullSheet, StockingSheet, StoreCaseSummary, StoreSection } from '../api/types'

/** React Query key for a store's display cases (nested sections + cards). */
export const storeCasesKey = (slug: string) => ['store-cases', slug] as const

/** React Query key for a store's Case Cards sections (flat) — kept for invalidations. */
export const storeSectionsKey = (slug: string) => ['store-sections', slug] as const

/**
 * useStoreCases — the store's display cases with their sections and
 * materialised listings. Public (no auth), so it backs both the storefront
 * Case Cards page and the owner's admin management view.
 */
export function useStoreCases(slug?: string) {
  return useQuery({
    queryKey: storeCasesKey(slug ?? ''),
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreCaseSummary[]>(`/stores/${slug}/cases`)
      return data
    },
  })
}

/** useStoreSections — flat section list (no case grouping). */
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

/** usePullSheet — a section's pull sheet (owner-only endpoint). */
export function usePullSheet(slug: string, sectionId: number | null) {
  return useQuery({
    queryKey: ['pull-sheet', slug, sectionId] as const,
    enabled: Boolean(slug) && null !== sectionId,
    // Staff keep this open while pulling; refresh as orders move.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await api.get<PullSheet>(`/stores/${slug}/sections/${sectionId}/pull-sheet`)
      return data
    },
  })
}

/** useStockingSheet — cards awaiting physical placement in the case (owner-only). */
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
