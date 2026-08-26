import { Link } from 'react-router'
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
  onAcceptMerchantTerms,
}: {
  data: OnboardingData
  plan?: Plan
  paymentRequired: boolean
  onJump: (step: number) => void
  onAcceptMerchantTerms: (value: boolean) => void
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
        {plan ? `${plan.name} · ${
          plan.billingModel === 'usage'
            ? `${(plan.feePercentBps ?? 500) / 100}% per sale until ${formatPrice(plan.capCents ?? 45000)}`
            : plan.priceCents === 0
              ? 'Free'
              : `${formatPrice(plan.priceCents)} one-time`
        }` : '—'}
      </ReviewRow>
      <ReviewRow title="Payment" onEdit={() => onJump(stepIndex('payment'))}>
        {paymentRequired
          ? data.payment.methodType
            ? `${METHOD_LABELS[data.payment.methodType]}${data.payment.last4 ? ` •••• ${data.payment.last4}` : ''}`
            : 'Not set'
          : 'No payment required (free plan)'}
      </ReviewRow>
      <ReviewRow title="Licenses" onEdit={() => onJump(stepIndex('licenses'))}>
        {data.compliance.legalBusinessName}
        {data.compliance.entityType ? ` · ${data.compliance.entityType.replace('_', ' ')}` : ''}
        {data.compliance.sellerPermitNumber ? ` · permit ${data.compliance.sellerPermitNumber}` : ''}
        {data.complianceDocuments.length ? ` · ${data.complianceDocuments.length} file(s)` : ''}
      </ReviewRow>

      <label className="flex items-start gap-2 rounded-card border border-border bg-surface p-4 text-sm leading-6 text-fg">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-current"
          checked={data.acceptedMerchantTerms}
          onChange={(e) => onAcceptMerchantTerms(e.target.checked)}
          required
        />
        <span>
          I am the merchant of record for this store, located in the United States. This platform is software
          only and is not the seller of my inventory. I will collect sales tax on pickup orders via Square,
          complete pickup in person, and I accept the{' '}
          <Link to="/merchant-terms" className="font-semibold text-brand-600 hover:underline">
            Merchant terms
          </Link>
          .
        </span>
      </label>

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
