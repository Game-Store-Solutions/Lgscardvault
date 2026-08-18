import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { Plan } from '../api/types'

export const plansKey = ['plans'] as const

/**
 * Subscription plans from the platform's plan catalog.
 *
 * `GET /plans` is public so the landing page can show real pricing (names,
 * prices, features) rather than a hardcoded copy that drifts from the backend.
 */
export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    // Plans are static marketing data — no need to refetch during a session.
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<{ plans: Plan[] }>('/plans')
      return data.plans
    },
  })
}

export default usePlans
