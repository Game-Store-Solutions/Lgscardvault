import { useQuery } from '@tanstack/react-query'
import api, { formatPrice } from '../api/client'
import type { Plan } from '../api/types'

export function planPriceLabel(plan: Plan): string {
  if (plan.billingModel === 'usage') {
    const pct = (plan.feePercentBps ?? 1000) / 100
    return `${pct}% of daily sales`
  }
  if (plan.priceCents > 0) {
    return formatPrice(plan.priceCents)
  }
  return 'Free'
}

export function planPriceDetail(plan: Plan): string {
  const cap = formatPrice(plan.capCents ?? 45000)
  if (plan.billingModel === 'usage') {
    return `${cap} / month · 10% of daily sales, remainder charged at month end`
  }
  if (plan.priceCents > 0) {
    return `${cap} / month · prepaid, no sales fees`
  }
  return ''
}

export function usePublicPlans() {
  return useQuery({
    queryKey: ['plans-public'],
    queryFn: async () => {
      const { data } = await api.get<{ plans: Plan[] }>('/plans')
      return data.plans
    },
  })
}
