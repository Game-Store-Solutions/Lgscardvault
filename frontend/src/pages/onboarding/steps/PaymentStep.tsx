import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../../api/client'
import type { PaymentClientConfig, Plan } from '../../../api/types'
import { Button } from '../../../components/ui'
import { SquarePaymentPanel } from '../../../components/payments/SquarePaymentPanel'
import { METHOD_LABELS } from '../config'
import type { OnboardingPayment, PatchPayment } from '../types'

export function PaymentStep({
  required,
  plan,
  payment,
  billingEmail,
  patchPayment,
}: {
  required: boolean
  plan?: Plan
  payment: OnboardingPayment
  billingEmail: string
  patchPayment: PatchPayment
}) {
  const configQuery = useQuery({
    queryKey: ['onboarding-payment-config'],
    queryFn: async () => {
      const { data } = await api.get<PaymentClientConfig>('/payments/onboarding/client-config')
      return data
    },
    enabled: required,
  })

  if (!required) {
    return (
      <p className="flex items-center gap-2 rounded-btn bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
        <CheckCircle2 aria-hidden className="size-4" />
        {plan?.name ?? 'This plan'} is free — no payment method needed. Continue to review.
      </p>
    )
  }

  if (configQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Loading payment options…
      </p>
    )
  }

  if (configQuery.isError || !configQuery.data) {
    return (
      <div className="max-w-xl space-y-3">
        <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
          {extractErrorMessage(configQuery.error, 'Payment options could not be loaded.')}
        </p>
        <Button variant="secondary" onClick={() => void configQuery.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const config = configQuery.data
  const priceCents = plan?.priceCents ?? 0

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center justify-between rounded-card border border-border bg-bg p-4">
        <div>
          <p className="text-sm text-fg-muted">You're subscribing to</p>
          <p className="font-display text-lg font-bold text-fg">{plan?.name}</p>
        </div>
        <p className="font-display text-2xl font-bold text-fg">
          {plan ? formatPrice(plan.priceCents) : ''}
          <span className="text-sm font-medium text-fg-muted">/mo</span>
        </p>
      </div>

      {config.mode === 'square' ? (
        <SquarePaymentPanel
          applicationId={config.applicationId}
          locationId={config.locationId}
          environment={config.environment}
          priceCents={priceCents}
          currency={config.currency}
          countryCode={config.countryCode}
          billingEmail={billingEmail}
          confirmLabel="Verify payment method"
          onTokenized={patchPayment}
        />
      ) : (
        <div className="space-y-3">
          <p className="rounded-btn bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
            Mock mode — no real charge is made. Add Square credentials to take live payments.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              patchPayment({
                methodType: 'card',
                token: `mock-card-${Date.now().toString(36)}`,
                last4: '1111',
                verificationToken: '',
              })
            }
          >
            Use a simulated card
          </Button>
        </div>
      )}

      {payment.methodType && payment.token && (
        <p className="flex items-center gap-2 text-sm font-medium text-success-700">
          <CheckCircle2 aria-hidden className="size-4" />
          {METHOD_LABELS[payment.methodType]} ready{payment.last4 ? ` •••• ${payment.last4}` : ''}.
        </p>
      )}
    </div>
  )
}

export default PaymentStep
