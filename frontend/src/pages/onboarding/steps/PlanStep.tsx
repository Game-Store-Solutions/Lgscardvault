import { CheckCircle2 } from 'lucide-react'
import { formatPrice } from '../../../api/client'
import type { Plan } from '../../../api/types'
import { Badge } from '../../../components/ui'

function planHeadline(plan: Plan): string {
  if (plan.billingModel === 'usage') {
    const pct = (plan.feePercentBps ?? 1000) / 100
    return `${pct}% of daily sales`
  }
  if (plan.priceCents > 0) {
    return formatPrice(plan.priceCents)
  }
  return 'Free'
}

function planSubline(plan: Plan): string {
  if (plan.billingModel === 'usage') {
    return `until ${formatPrice(plan.capCents ?? 45000)} · settled nightly`
  }
  if (plan.priceCents > 0) {
    return 'one-time'
  }
  return ''
}

export function PlanStep({
  plans,
  loading,
  selected,
  onSelect,
}: {
  plans: Plan[]
  loading: boolean
  selected: string
  onSelect: (key: string) => void
}) {
  if (loading) {
    return <p className="text-sm text-fg-muted">Loading plans…</p>
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plans.map((plan) => {
        const active = plan.key === selected
        return (
          <button
            key={plan.key}
            type="button"
            onClick={() => onSelect(plan.key)}
            aria-pressed={active}
            className={`flex flex-col rounded-card border p-5 text-left transition-colors ${
              active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500' : 'border-border bg-surface hover:border-brand-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-fg">{plan.name}</span>
              {plan.popular && <Badge tone="brand">Popular</Badge>}
            </div>
            <p className="mt-1 text-sm text-fg-muted">{plan.tagline}</p>
            <p className="mt-4 font-display text-3xl font-bold text-fg">
              {planHeadline(plan)}
              {planSubline(plan) ? (
                <span className="ml-2 text-sm font-medium text-fg-muted">{planSubline(plan)}</span>
              ) : null}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-fg">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        )
      })}
    </div>
  )
}

export default PlanStep
