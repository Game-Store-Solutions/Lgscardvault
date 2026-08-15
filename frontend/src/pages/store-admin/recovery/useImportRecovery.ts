import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/client'
import { inventoryKey } from '../../../hooks'
import type {
  CardSummary,
  RecoveryQueue,
  RecoveryRelaxation,
  RecoverySearchResponse,
} from '../../../api/types'

/**
 * Data layer for the Fix failed cards workspace.
 *
 * Every query lives under its own `import-recovery` key namespace so working a
 * failed list never invalidates the shared catalog/search caches the rest of
 * the admin reads. The single deliberate exception is inventory, which must
 * refresh once a row is actually stocked.
 */
export function recoveryKey(slug: string, importId: string) {
  return ['import-recovery', slug, importId] as const
}

function base(slug: string, importId: string) {
  return `/stores/${slug}/csv-imports/${importId}/recovery`
}

/** Filters the search ladder may drop, in the order the UI lists them. */
export interface RecoveryFilters {
  set: string
  collectorNumber: string
  rarity: string
  finish: 'foil' | 'nonfoil'
}

export function useRecoveryQueue(slug: string, importId: string) {
  return useQuery({
    queryKey: [...recoveryKey(slug, importId), 'queue'],
    queryFn: async () => {
      const { data } = await api.get<RecoveryQueue>(`${base(slug, importId)}/queue`)
      return data
    },
    enabled: slug !== '' && importId !== '',
  })
}

/**
 * The ladder search. Disabled until there is something to search for, so
 * selecting a row does not fire a request with an empty name.
 */
export function useRecoverySearch(
  slug: string,
  importId: string,
  term: string,
  filters: RecoveryFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...recoveryKey(slug, importId), 'search', term, filters],
    queryFn: async () => {
      const { data } = await api.get<RecoverySearchResponse>(`${base(slug, importId)}/search`, {
        params: {
          q: term,
          ...(filters.set ? { set: filters.set } : {}),
          ...(filters.collectorNumber ? { collectorNumber: filters.collectorNumber } : {}),
          ...(filters.rarity ? { rarity: filters.rarity } : {}),
          finish: filters.finish,
        },
      })
      return data
    },
    enabled: enabled && term.trim() !== '',
    // Recovery is a burst of searches by one operator; keep recent terms warm
    // so stepping back to a previous row is instant.
    staleTime: 60_000,
  })
}

/** Other paper printings of a matched card, for one-click printing swaps. */
export function useCardPrintings(slug: string, importId: string, cardId: string | null) {
  return useQuery({
    queryKey: [...recoveryKey(slug, importId), 'printings', cardId],
    queryFn: async () => {
      const { data } = await api.get<{ items: CardSummary[] }>(
        `${base(slug, importId)}/printings/${cardId}`,
      )
      return data.items
    },
    enabled: cardId !== null,
    staleTime: 5 * 60_000,
  })
}

export function useRecoveryActions(slug: string, importId: string) {
  const queryClient = useQueryClient()

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: recoveryKey(slug, importId) })
    await queryClient.invalidateQueries({ queryKey: ['csv-import-run', slug, importId] })
  }

  const resolveRow = useMutation({
    mutationFn: async (input: {
      rowIndex: number
      cardId: string
      quantity: number
      condition: string
      isFoil: boolean
    }) => {
      await api.post(
        `/stores/${slug}/csv-imports/${importId}/rows/${input.rowIndex}/manual-import`,
        {
          cardId: input.cardId,
          quantity: input.quantity,
          condition: input.condition,
          isFoil: input.isFoil,
        },
      )
    },
    onSuccess: async () => {
      // The one intentional cross-boundary invalidation: a resolved row is
      // now real stock.
      await queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
      await refresh()
    },
  })

  const saveRow = useMutation({
    mutationFn: async (input: {
      rowIndex: number
      name: string
      set: string
      collectorNumber: string
      quantity: number
      condition: string
      isFoil: boolean
    }) => {
      const { rowIndex, ...body } = input
      await api.patch(`/stores/${slug}/csv-imports/${importId}/rows/${rowIndex}`, body)
    },
    onSuccess: refresh,
  })

  const skipRow = useMutation({
    mutationFn: async (input: { rowIndex: number; skipped: boolean }) => {
      await api.post(
        `${base(slug, importId)}/rows/${input.rowIndex}/${input.skipped ? 'skip' : 'unskip'}`,
      )
    },
    onSuccess: refresh,
  })

  const resolveByReference = useMutation({
    mutationFn: async (ref: string) => {
      const { data } = await api.get<{ card: CardSummary }>(`${base(slug, importId)}/reference`, {
        params: { ref },
      })
      return data.card
    },
  })

  return { resolveRow, saveRow, skipRow, resolveByReference, refresh }
}

/** Plain-language description of what the ladder had to ignore. */
export function describeRelaxations(relaxed: RecoveryRelaxation[]): string | null {
  if (relaxed.length === 0) return null

  const parts: string[] = []
  if (relaxed.includes('alchemyName')) parts.push('the Alchemy "A-" name prefix')
  if (relaxed.includes('collectorNumber')) parts.push('the collector number')
  if (relaxed.includes('rarity')) parts.push('the rarity')
  if (relaxed.includes('set')) parts.push('the set')
  if (relaxed.includes('fuzzyName')) parts.push('the exact spelling')

  if (parts.length === 0) return null
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

  return `Widened the search — ignored ${list} from this row.`
}
