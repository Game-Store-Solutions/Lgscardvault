import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, ShieldCheck, Store } from 'lucide-react'
import { Link } from 'react-router'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { Order, OrderFulfillment, StoreCheckoutConfig } from '../../api/types'
import { cx } from '../../lib/cx'
import { Button } from '../ui'
import { PaypalButtons } from './PaypalButtons'
import {
  checkoutPayButtonClass,
  PaymentDivider,
  SquarePaymentPanel,
  type TokenizedPayment,
} from './SquarePaymentPanel'

/**
 * Store checkout: Square wallets when Square is connected, PayPal (including
 * Apple Pay / Google Pay) when PayPal is connected, plus pay in store.
 */
export function CheckoutPanel({
  slug,
  amountDueCents,
  reserveAmountCents,
  buyerEmail,
  checkoutPath,
  checkoutBody,
  paymentReady,
  isGuest = false,
  fulfillment = 'pickup',
  showOwnerDiagnostics = false,
  paymentBlockedMessage = 'Enter your name to continue.',
  paymentsAdminHref,
  cardCheckoutReady = true,
  cardCheckoutBlockedMessage,
  onPlaced,
}: {
  slug: string
  amountDueCents: number
  /** Merchandise remaining for a pay-in-store reserve (tax is collected at the counter). */
  reserveAmountCents?: number
  buyerEmail: string
  checkoutPath: string
  checkoutBody: Record<string, unknown>
  paymentReady: boolean
  isGuest?: boolean
  fulfillment?: OrderFulfillment
  showOwnerDiagnostics?: boolean
  paymentBlockedMessage?: string
  paymentsAdminHref?: string
  cardCheckoutReady?: boolean
  cardCheckoutBlockedMessage?: string | null
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
    mutationFn: async (payment: TokenizedPayment | { provider: 'paypal'; token: string } | null) => {
      const body =
        payment === null
          ? checkoutBody
          : 'provider' in payment && payment.provider === 'paypal'
            ? {
                ...checkoutBody,
                provider: 'paypal',
                token: payment.token,
                methodType: 'paypal',
              }
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

  const createPaypalOrder = useCallback(async () => {
    const path = isGuest
      ? `/stores/${slug}/guest/checkout/paypal/order`
      : `/stores/${slug}/customer/checkout/paypal/order`
    const { data } = await api.post<{ orderId: string }>(path, checkoutBody)
    if (!data.orderId) {
      throw new Error('PayPal did not return an order.')
    }
    return data.orderId
  }, [checkoutBody, isGuest, slug])

  const approvePaypal = useCallback(
    async (orderId: string) => {
      await checkout.mutateAsync({ provider: 'paypal', token: orderId })
    },
    [checkout],
  )

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
  const paypalEnabled = config?.paypal?.enabled === true
  const onlineEnabled = squareEnabled || paypalEnabled
  const holdCents = reserveAmountCents ?? amountDueCents

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
        We'll hold your items. Pay at the counter when you pick up.
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
          Reserve order · pay in store {formatPrice(holdCents)}
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

  if (!onlineEnabled || !cardCheckoutReady) {
    const shopperMessage = !cardCheckoutReady
      ? cardCheckoutBlockedMessage?.trim() ||
        'Online checkout is paused until this store enables sales tax on Square. Reserve and pay in store.'
      : config?.message?.trim() ||
        config?.paypal?.message?.trim() ||
        'Online wallets aren\'t available right now. Reserve your order and pay in store at pickup.'
    const ownerMessage = config?.ownerMessage?.trim()

    return (
      <div className="mt-5 space-y-3">
        {!cardCheckoutReady || !showOwnerDiagnostics || !ownerMessage ? (
          <p className="rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">{shopperMessage}</p>
        ) : (
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
        <div className="mt-3 min-w-0 space-y-4">
          {squareEnabled ? (
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
          ) : null}
          {paypalEnabled && config.paypal ? (
            <>
              {squareEnabled ? <PaymentDivider label="Or pay with PayPal" /> : null}
              <PaypalButtons
                clientId={config.paypal.clientId}
                merchantId={config.paypal.merchantId}
                environment={config.paypal.environment}
                currency={config.paypal.currency}
                disabled={checkout.isPending}
                amountCents={amountDueCents}
                wallets={!squareEnabled}
                createOrder={createPaypalOrder}
                onApproved={approvePaypal}
              />
            </>
          ) : null}
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
        Wallet payments are processed by {[squareEnabled && 'Square', paypalEnabled && 'PayPal'].filter(Boolean).join(' and ')}.
      </p>
    </div>
  )
}
