import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
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
    <div className="grid border-t border-border md:grid-cols-2">
      {plans.map((plan, index) => (
        <div
          key={plan.key}
          className={cx(
            'flex flex-col py-8 md:px-8',
            index === 0 ? 'md:border-r md:border-border md:pl-0' : 'md:pr-0',
            index > 0 && 'border-t border-border md:border-t-0',
          )}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-2xl font-bold text-fg">{plan.name}</h3>
            {plan.popular ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Most stores
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-fg-muted">{plan.tagline}</p>
          <p className="mt-6 font-display text-4xl font-bold tabular-nums text-fg">{planPriceLabel(plan)}</p>
          <p className="mt-1 text-sm text-fg-muted">{planPriceDetail(plan)}</p>
          <ul className="mt-6 flex-1 space-y-2 text-sm leading-6 text-fg">
            {plan.features.map((feature) => (
              <li key={feature} className="border-l-2 border-border pl-3">
                {feature}
              </li>
            ))}
          </ul>
          <Link
            to={applyHref}
            className={cx(
              buttonVariants({ variant: plan.popular ? 'primary' : 'secondary', size: 'lg' }),
              'mt-8 w-full',
              !plan.popular &&
                'dark:bg-transparent dark:text-white dark:ring-white/25 dark:hover:bg-white/10',
            )}
          >
            {ctaLabel}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      ))}
    </div>
  )
}
