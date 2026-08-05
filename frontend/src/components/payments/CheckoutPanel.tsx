import { useMutation, useQuery } from '@tanstack/react-query'
import { Lock, PackageCheck, ShieldCheck } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { Order, OrderFulfillment, StoreCheckoutConfig } from '../../api/types'
import { Button } from '../ui'
import { SquarePaymentPanel, type TokenizedPayment } from './SquarePaymentPanel'

/**
 * Real checkout: the shopper pays the STORE through that store's own connected
 * Square account. Rendered only when the store has finished connecting; the
 * cart falls back to its "checkout coming soon" state otherwise.
 */
export function CheckoutPanel({
  slug,
  amountDueCents,
  fulfillment,
  useStoreCredit,
  buyerEmail,
  onPlaced,
}: {
  slug: string
  amountDueCents: number
  fulfillment: OrderFulfillment
  useStoreCredit: boolean
  buyerEmail: string
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
      const { data } = await api.post<Order>(`/stores/${slug}/customer/checkout`, {
        fulfillment,
        useStoreCredit,
        ...(payment ? { token: payment.token, verificationToken: payment.verificationToken } : {}),
      })
      return data
    },
    onSuccess: onPlaced,
  })

  const config = configQuery.data

  if (!config?.enabled) {
    return (
      <Button className="mt-5 w-full" size="lg" disabled title="This store has not enabled online payments">
        <Lock aria-hidden className="size-4" />
        Checkout
      </Button>
    )
  }

  // Store credit can cover the whole basket, in which case there is nothing to
  // charge and no card is needed.
  const fullyCovered = amountDueCents <= 0

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold text-fg">Due now</span>
        <span className="font-display text-2xl font-extrabold text-fg">{formatPrice(Math.max(0, amountDueCents))}</span>
      </div>

      {fullyCovered ? (
        <Button
          className="w-full"
          size="lg"
          loading={checkout.isPending}
          onClick={() => checkout.mutate(null)}
        >
          <PackageCheck aria-hidden className="size-4" />
          Place order with store credit
        </Button>
      ) : (
        <SquarePaymentPanel
          applicationId={config.applicationId}
          locationId={config.locationId}
          environment={config.environment}
          priceCents={amountDueCents}
          currency={config.currency}
          countryCode={config.countryCode}
          billingEmail={buyerEmail}
          confirmLabel={`Pay ${formatPrice(amountDueCents)}`}
          onTokenized={(payment) => checkout.mutate(payment)}
        />
      )}

      {checkout.isPending && (
        <p role="status" className="text-xs font-medium text-fg-muted">
          Completing your order…
        </p>
      )}

      {Boolean(checkout.error) && (
        <p role="alert" className="rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {extractErrorMessage(checkout.error, 'Your payment could not be completed.')}
        </p>
      )}

      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <ShieldCheck aria-hidden className="size-3.5 text-success-700" />
        Card details go straight to Square — they never touch our servers.
      </p>
    </div>
  )
}
