import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import api, { formatPrice } from '../api/client'
import type { Plan } from '../api/types'
import { Button } from '../components/ui'

function planPriceLabel(plan: Plan): string {
  if (plan.billingModel === 'usage') {
    const pct = (plan.feePercentBps ?? 500) / 100
    return `${pct}% per sale`
  }
  if (plan.priceCents > 0) {
    return formatPrice(plan.priceCents)
  }
  return 'Free'
}

function planPriceDetail(plan: Plan): string {
  const cap = formatPrice(plan.capCents ?? 45000)
  if (plan.billingModel === 'usage') {
    return `Until ${cap} is paid — then no more platform fees.`
  }
  if (plan.priceCents > 0) {
    return `One-time · full platform access`
  }
  return ''
}

export default function PricingPage() {
  const { data: plans = [], isPending } = useQuery({
    queryKey: ['plans-public'],
    queryFn: async () => {
      const { data } = await api.get<{ plans: Plan[] }>('/plans')
      return data.plans
    },
  })

  return (
    <div className="bg-bg">
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-10 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Store owners</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          Simple pricing. Everything included.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-fg-muted">
          Open your verified storefront on LGS Card Vault for a flat $450, or pay 5% of each online sale until you reach
          $450 — then keep every feature with no monthly bill and no sales fees.
        </p>

        {isPending ? (
          <p className="mt-10 text-sm text-fg-muted">Loading plans…</p>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {plans.map((plan) => (
              <div
                key={plan.key}
                className={`flex flex-col rounded-card border p-6 sm:p-8 ${
                  plan.popular ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500' : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-bold text-fg">{plan.name}</h2>
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
                <Button asChild className="mt-8 w-full" size="lg">
                  <Link to="/register/owner">
                    Get started
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-16 rounded-card border border-border bg-surface p-6 text-sm text-fg-muted sm:p-8">
          <p className="font-semibold text-fg">What about shopper checkout fees?</p>
          <p className="mt-2 leading-relaxed">
            Square and PayPal charge their normal card-processing rates on each sale — that is separate from the LGS Card
            Vault platform fee. On the pay-as-you-sell plan, our 5% is only until you have paid $450 total to the
            platform.
          </p>
          <p className="mt-4">
            Questions?{' '}
            <Link to="/#contact" className="font-semibold text-brand-600 hover:underline">
              Contact us
            </Link>{' '}
            or email{' '}
            <a href="mailto:hello@lgscardvault.com" className="font-semibold text-brand-600 hover:underline">
              hello@lgscardvault.com
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  )
}
