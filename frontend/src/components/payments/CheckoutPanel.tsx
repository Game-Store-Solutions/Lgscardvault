import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, ShieldCheck, Store } from 'lucide-react'
import { Link } from 'react-router'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { Order, OrderFulfillment, StoreCheckoutConfig } from '../../api/types'
import { cx } from '../../lib/cx'
import { Button } from '../ui'
import {
  checkoutPayButtonClass,
  PaymentDivider,
  SquarePaymentPanel,
  type TokenizedPayment,
} from './SquarePaymentPanel'

/**
 * Store checkout: Apple Pay / Google Pay when Square is connected, plus pay in
 * store for pickup (with a Square QR when the store can take online payments).
 */
export function CheckoutPanel({
  slug,
  amountDueCents,
  buyerEmail,
  checkoutPath,
  checkoutBody,
  paymentReady,
  isGuest = false,
  fulfillment = 'pickup',
  showOwnerDiagnostics = false,
  paymentBlockedMessage = 'Enter your name to continue.',
  paymentsAdminHref,
  onPlaced,
}: {
  slug: string
  amountDueCents: number
  buyerEmail: string
  checkoutPath: string
  checkoutBody: Record<string, unknown>
  paymentReady: boolean
  isGuest?: boolean
  fulfillment?: OrderFulfillment
  showOwnerDiagnostics?: boolean
  paymentBlockedMessage?: string
  paymentsAdminHref?: string
  onPlaced: (order: Order) => void
}) {
  const queryClient = useQueryClient()
  const pickupAvailable = fulfillment === 'pickup'

  const configQuery = useQuery({
    queryKey: ['store-checkout-config', slug, isGuest ? 'guest' : 'customer'],
    queryFn: async () => {
      const { data } = await api.get<StoreCheckoutConfig>(
        isGuest ? `/stores/${slug}/guest/checkout/config` : `/stores/${slug}/customer/checkout/config`,
      )
      return data
    },
  })

  const checkout = useMutation({
    mutationFn: async (payment: TokenizedPayment | null) => {
      const body =
        payment === null
          ? checkoutBody
          : {
              ...checkoutBody,
              token: payment.token,
              verificationToken: payment.verificationToken,
              methodType: payment.methodType,
            }
      const { data } = await api.post<Order>(checkoutPath, body)
      return data
    },
    onSuccess: onPlaced,
    onError: (error) => {
      const msg = extractErrorMessage(error, '')
      if (
        /not accepting online payments/i.test(msg) ||
        /reconnect square/i.test(msg) ||
        /payment processor/i.test(msg)
      ) {
        void queryClient.invalidateQueries({ queryKey: ['store-checkout-config', slug] })
      }
    },
  })

  const payInStore = useMutation({
    mutationFn: async () => {
      const path = isGuest
        ? `/stores/${slug}/guest/checkout/pay-in-store`
        : `/stores/${slug}/customer/checkout/pay-in-store`
      const { data } = await api.post<Order>(path, checkoutBody)
      return data
    },
    onSuccess: onPlaced,
  })

  const config = configQuery.data
  const loadingConfig = configQuery.isLoading
  const squareEnabled = config?.enabled === true

  if (loadingConfig) {
    return (
      <Button className="mt-5 w-full" size="lg" disabled>
        <PackageCheck aria-hidden className="size-4" />
        Loading checkout…
      </Button>
    )
  }

  const payInStoreBlock = pickupAvailable ? (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        {squareEnabled
          ? 'We\'ll hold your items. Pay at the counter, or scan the Square QR after you reserve.'
          : 'We\'ll hold your items. Pay at the counter when you pick up. No card needed online.'}
      </p>
      {!paymentReady ? (
        <p className="rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">{paymentBlockedMessage}</p>
      ) : (
        <Button
          className={checkoutPayButtonClass}
          size="lg"
          loading={payInStore.isPending}
          onClick={() => payInStore.mutate()}
        >
          <Store aria-hidden className="size-4" />
          Reserve order · pay in store {formatPrice(amountDueCents)}
        </Button>
      )}
      {payInStore.isError ? (
        <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {extractErrorMessage(payInStore.error, 'Could not reserve your order.')}
        </p>
      ) : null}
    </div>
  ) : (
    <p className="rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">
      Switch to <span className="font-bold text-fg">Pick up in store</span> above to reserve this order and pay at the
      counter.
    </p>
  )

  if (!squareEnabled) {
    const shopperMessage =
      config?.message?.trim() ||
      'Online wallets aren\'t available right now. Reserve your order and pay in store at pickup.'
    const ownerMessage = config?.ownerMessage?.trim()

    return (
      <div className="mt-5 space-y-3">
        {showOwnerDiagnostics && ownerMessage ? (
          <p className="rounded-btn bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-800 dark:bg-warning-950/40 dark:text-warning-200">
            {ownerMessage}
            {paymentsAdminHref ? (
              <>
                {' '}
                <Link to={paymentsAdminHref} className="font-bold underline underline-offset-2">
                  Open Payments in admin
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <p className="rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">{shopperMessage}</p>
        )}
        {payInStoreBlock}
      </div>
    )
  }

  const fullyCovered = amountDueCents <= 0

  if (!paymentReady) {
    return (
      <p className="mt-5 rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">{paymentBlockedMessage}</p>
    )
  }

  return (
    <div className="mt-5 min-w-0 pt-5">
      <p className="text-sm font-semibold text-fg">Payment</p>

      {fullyCovered ? (
        <Button
          className={cx(checkoutPayButtonClass, 'mt-4')}
          size="lg"
          loading={checkout.isPending}
          onClick={() => checkout.mutate(null)}
        >
          <PackageCheck aria-hidden className="size-4" />
          Place order with store credit
        </Button>
      ) : (
        <div className="mt-3 min-w-0 space-y-1">
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
            payButtonPlacement="inline"
            showCardForm={false}
            onTokenized={(payment) => checkout.mutate(payment)}
          />
          {pickupAvailable ? <PaymentDivider label="Or pay in store" /> : null}
          {payInStoreBlock}
        </div>
      )}

      {checkout.isPending && (
        <p role="status" className="mt-3 text-xs font-medium text-fg-muted">
          Completing your order…
        </p>
      )}

      {Boolean(checkout.error) && (
        <p
          role="alert"
          className="mt-3 rounded-btn bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700 dark:bg-danger-950/40"
        >
          {extractErrorMessage(checkout.error, 'Your payment could not be completed.')}
        </p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
        <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-success-700" />
        Wallets and QR payments are processed by Square.
      </p>
    </div>
  )
}
