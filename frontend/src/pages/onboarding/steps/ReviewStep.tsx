import type { ReactNode } from 'react'
import { formatPrice } from '../../../api/client'
import type { Plan } from '../../../api/types'
import { Button } from '../../../components/ui'
import { METHOD_LABELS, stepIndex } from '../config'
import type { OnboardingData } from '../types'

export function ReviewStep({
  data,
  plan,
  paymentRequired,
  onJump,
}: {
  data: OnboardingData
  plan?: Plan
  paymentRequired: boolean
  onJump: (step: number) => void
}) {
  const a = data.address
  return (
    <div className="space-y-5">
      <ReviewRow title="Account" onEdit={() => onJump(stepIndex('account'))}>
        {data.displayName} · {data.email}
      </ReviewRow>
      <ReviewRow title="Address" onEdit={() => onJump(stepIndex('address'))}>
        {[a.addressLine1, a.addressLine2, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(', ')}
        {data.phone ? ` · ${data.phone}` : ''}
      </ReviewRow>
      <ReviewRow title="Store" onEdit={() => onJump(stepIndex('branding'))}>
        {data.storeName} · /s/{data.slug}
      </ReviewRow>
      <ReviewRow title="Plan" onEdit={() => onJump(stepIndex('plan'))}>
        {plan ? `${plan.name} · ${plan.priceCents === 0 ? 'Free' : `${formatPrice(plan.priceCents)}/mo`}` : '—'}
      </ReviewRow>
      <ReviewRow title="Payment" onEdit={() => onJump(stepIndex('payment'))}>
        {paymentRequired
          ? data.payment.methodType
            ? `${METHOD_LABELS[data.payment.methodType]}${data.payment.last4 ? ` •••• ${data.payment.last4}` : ''}`
            : 'Not set'
          : 'No payment required (free plan)'}
      </ReviewRow>

      <p className="rounded-btn bg-bg px-4 py-4 text-sm leading-relaxed text-fg-muted sm:text-base">
        When you submit, your store is created in a <span className="font-bold text-fg">pending</span> state. A platform admin
        reviews it and, once approved, your storefront goes live.
      </p>
    </div>
  )
}

function ReviewRow({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-card border border-border bg-surface p-5 sm:p-6">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{title}</p>
        <p className="mt-1.5 break-words text-sm text-fg sm:text-base">{children}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  )
}

export default ReviewStep
