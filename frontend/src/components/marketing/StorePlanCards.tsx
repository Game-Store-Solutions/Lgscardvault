import { Link } from 'react-router'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Plan } from '../../api/types'
import { planPriceDetail, planPriceLabel } from '../../lib/plans'
import { cx } from '../../lib/cx'
import { buttonVariants } from '../ui'

export function StorePlanCards({
  plans,
  applyHref,
  ctaLabel = 'Get started',
}: {
  plans: Plan[]
  applyHref: string
  ctaLabel?: string
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map((plan) => (
        <div
          key={plan.key}
          className={cx(
            'flex flex-col rounded-card border p-6 shadow-card sm:p-8',
            plan.popular
              ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500 dark:bg-brand-500/10'
              : 'border-border bg-surface dark:border-white/10 dark:bg-white/[0.03]',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-2xl font-bold text-fg">{plan.name}</h3>
            {plan.popular ? (
              <span className="rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">Popular</span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-fg-muted">{plan.tagline}</p>
          <p className="mt-6 font-display text-4xl font-bold tabular-nums text-fg">{planPriceLabel(plan)}</p>
          <p className="mt-1 text-sm text-fg-muted">{planPriceDetail(plan)}</p>
          <ul className="mt-6 flex-1 space-y-2.5 text-sm text-fg">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
                {feature}
              </li>
            ))}
          </ul>
          <Link to={applyHref} className={cx(buttonVariants({ variant: 'primary', size: 'lg' }), 'mt-8 w-full')}>
            {ctaLabel}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      ))}
    </div>
  )
}
