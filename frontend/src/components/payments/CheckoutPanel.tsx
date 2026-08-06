import { useMutation, useQuery } from '@tanstack/react-query'
import { Lock, PackageCheck, ShieldCheck } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { Order, StoreCheckoutConfig } from '../../api/types'
import { Button } from '../ui'
import { SquarePaymentPanel, type TokenizedPayment } from './SquarePaymentPanel'

/**
 * Real checkout: the shopper pays the STORE through that store's own connected
 * Square account.
 */
export function CheckoutPanel({
  slug,
  amountDueCents,
  buyerEmail,
  checkoutPath,
  checkoutBody,
  paymentReady,
  paymentBlockedMessage = 'Enter your name to continue.',
  onPlaced,
}: {
  slug: string
  amountDueCents: number
  buyerEmail: string
  checkoutPath: string
  checkoutBody: Record<string, unknown>
  paymentReady: boolean
  paymentBlockedMessage?: string
  onPlaced: (order: Order) => void
}) {
  const configQuery = useQuery({
    queryKey: ['store-checkout-config', slug],
    queryFn: async () => {
      const { data } = await api.get<StoreCheckoutConfig>(`/stores/${slug}/customer/checkout/config`)
      return data
    },
  })

  const checkout = useMutation({
    mutationFn: async (payment: TokenizedPayment | null) => {
      const { data } = await api.post<Order>(checkoutPath, {
        ...checkoutBody,
        ...(payment ? { token: payment.token, verificationToken: payment.verificationToken } : {}),
      })
      return data
    },
    onSuccess: onPlaced,
  })

  const config = configQuery.data
  const loadingConfig = configQuery.isLoading

  if (loadingConfig) {
    return (
      <Button className="mt-5 w-full" size="lg" disabled>
        <PackageCheck aria-hidden className="size-4" />
        Loading checkout…
      </Button>
    )
  }

  if (!config?.enabled) {
    return (
      <div className="mt-5 space-y-2">
        <Button className="w-full" size="lg" disabled title="This store has not enabled online payments">
          <Lock aria-hidden className="size-4" />
          Pay with card
        </Button>
        <p className="rounded-btn border border-border bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">
          Online card checkout is not available for this store yet.
        </p>
      </div>
    )
  }

  const fullyCovered = amountDueCents <= 0

  if (!paymentReady) {
    return (
      <p className="mt-5 rounded-btn border border-border bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">
        {paymentBlockedMessage}
      </p>
    )
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Payment</p>

      {fullyCovered ? (
        <Button
          className="mt-4 w-full"
          size="lg"
          loading={checkout.isPending}
          onClick={() => checkout.mutate(null)}
        >
          <PackageCheck aria-hidden className="size-4" />
          Place order with store credit
        </Button>
      ) : (
        <div className="mt-4">
          <SquarePaymentPanel
            applicationId={config.applicationId}
            locationId={config.locationId}
            environment={config.environment}
            priceCents={amountDueCents}
            currency={config.currency}
            countryCode={config.countryCode}
            billingEmail={buyerEmail}
            confirmLabel={`Pay ${formatPrice(amountDueCents)}`}
            paymentRequestLabel="Order total"
            layout="checkout"
            onTokenized={(payment) => checkout.mutate(payment)}
          />
        </div>
      )}

      {checkout.isPending && (
        <p role="status" className="mt-3 text-xs font-medium text-fg-muted">
          Completing your order…
        </p>
      )}

      {Boolean(checkout.error) && (
        <p role="alert" className="mt-3 rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {extractErrorMessage(checkout.error, 'Your payment could not be completed.')}
        </p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
        <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-success-700" />
        Payments are processed by Square. We never store your full card number.
      </p>
    </div>
  )
}
