import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../../api/client'
import type { PaymentClientConfig, Plan } from '../../../api/types'
import { Button } from '../../../components/ui'
import { SquarePaymentPanel } from '../../../components/payments/SquarePaymentPanel'
import { PaypalButtons } from '../../../components/payments/PaypalButtons'
import { isDevBuild } from '../../../lib/runtimeEnv'
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

  const createPaypalOrder = useCallback(async () => {
    const { data } = await api.post<{ orderId: string }>('/payments/onboarding/paypal/order', {
      planKey: plan?.key ?? '',
    })
    if (!data.orderId) {
      throw new Error('PayPal did not return an order.')
    }
    return data.orderId
  }, [plan?.key])

  if (!required) {
    return (
      <p className="flex items-center gap-2 rounded-btn bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
        <CheckCircle2 aria-hidden className="size-4" />
        {plan?.name ?? 'This plan'} is free. No payment method needed. Continue to review.
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
      <div className="mx-auto w-full max-w-xl space-y-3">
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
  const paypalEnabled = config.paypal?.enabled === true
  const squareReady = config.mode === 'square'

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
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

      {squareReady ? (
        <SquarePaymentPanel
          applicationId={config.applicationId}
          locationId={config.locationId}
          environment={config.environment}
          priceCents={priceCents}
          currency={config.currency}
          countryCode={config.countryCode}
          billingEmail={billingEmail}
          confirmLabel="Verify payment method"
          paymentRequestLabel="Platform subscription"
          layout="checkout"
          onTokenized={patchPayment}
        />
      ) : isDevBuild ? (
        <div className="space-y-3">
          <p className="rounded-btn bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
            Dev only. Square is not configured; no real charge is made.
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
      ) : paypalEnabled ? null : (
        <p className="rounded-btn border border-border bg-bg px-3 py-2 text-sm text-fg-muted">
          Payment verification is unavailable right now. Please try again later or contact support.
        </p>
      )}

      {paypalEnabled && config.paypal ? (
        <div className="space-y-2">
          {squareReady || isDevBuild ? (
            <p className="text-xs font-medium text-fg-muted">Or pay the first month with PayPal</p>
          ) : null}
          <PaypalButtons
            clientId={config.paypal.clientId}
            environment={config.paypal.environment}
            currency={config.paypal.currency}
            amountCents={priceCents}
            wallets={!squareReady}
            createOrder={createPaypalOrder}
            onApproved={async (orderId) => {
              patchPayment({
                methodType: 'paypal',
                token: orderId,
                last4: '',
                verificationToken: '',
              })
            }}
          />
        </div>
      ) : null}

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
