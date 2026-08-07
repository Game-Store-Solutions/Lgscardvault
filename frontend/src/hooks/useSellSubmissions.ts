import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { SellSubmission } from '../api/types'

export const sellSubmissionsKey = (slug: string) => ['sell-submissions', slug] as const

export const pendingSellSubmissionsCountKey = (slug: string) => [...sellSubmissionsKey(slug), 'pending-count'] as const

export function usePendingSellSubmissionCount(slug: string, enabled = true) {
  return useQuery({
    queryKey: pendingSellSubmissionsCountKey(slug),
    enabled: Boolean(slug) && enabled,
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await api.get<{ pendingCount: number }>(`/stores/${slug}/sell-submissions/pending-count`)
      return Math.max(0, Number(data.pendingCount) || 0)
    },
  })
}

export function useSellSubmissionsList(slug: string) {
  return useQuery({
    queryKey: sellSubmissionsKey(slug),
    queryFn: async () => {
      const { data } = await api.get<SellSubmission[]>(`/stores/${slug}/sell-submissions`)
      return data
    },
    refetchInterval: 30_000,
  })
}
