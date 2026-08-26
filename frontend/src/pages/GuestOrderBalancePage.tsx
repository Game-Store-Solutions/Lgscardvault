import { useCallback, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api, { formatPrice } from '../api/client'
import type { StoreCheckoutConfig } from '../api/types'
import { PaypalButtons } from '../components/payments/PaypalButtons'
import { Button } from '../components/ui'

type GuestOrderBalance = {
  reference: string
  storeName?: string | null
  storeSlug?: string | null
  customerName?: string | null
  balanceDueCents: number
  totalCents: number
  paidCents: number
  paymentProvider?: string | null
  paypal?: StoreCheckoutConfig['paypal']
}

export default function GuestOrderBalancePage() {
  const { slug = '', orderId = '' } = useParams<{ slug: string; orderId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const queryClient = useQueryClient()

  const balanceQuery = useQuery({
    queryKey: ['guest-order-balance', slug, orderId, token],
    queryFn: async () => {
      const { data } = await api.get<GuestOrderBalance>(
        `/stores/${slug}/guest/orders/${orderId}/balance`,
        { params: { token } },
      )
      return data
    },
    enabled: Boolean(slug && orderId && token),
    retry: false,
  })

  const due = balanceQuery.data?.balanceDueCents ?? 0
  const paypal = balanceQuery.data?.paypal
  const paid = useMemo(() => due < 1 && balanceQuery.isSuccess, [balanceQuery.isSuccess, due])

  const createOrder = useCallback(async () => {
    const { data } = await api.post<{ orderId: string }>(
      `/stores/${slug}/guest/orders/${orderId}/paypal/order`,
      { token },
    )
    if (!data.orderId) {
      throw new Error('PayPal did not return an order.')
    }
    return data.orderId
  }, [orderId, slug, token])

  const onApproved = useCallback(
    async (paypalOrderId: string) => {
      await api.post(`/stores/${slug}/guest/orders/${orderId}/paypal/capture`, {
        token,
        paypalOrderId,
      })
      await queryClient.invalidateQueries({ queryKey: ['guest-order-balance', slug, orderId, token] })
    },
    [orderId, queryClient, slug, token],
  )

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-fg">Invalid payment link</h1>
        <p className="mt-3 text-sm text-fg-muted">This link is missing its security token. Ask the store to resend the email.</p>
      </div>
    )
  }

  if (balanceQuery.isPending) {
    return <p className="px-4 py-16 text-center text-sm text-fg-muted">Loading your order…</p>
  }

  if (balanceQuery.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-fg">This link is not valid</h1>
        <p className="mt-3 text-sm text-fg-muted">
          It may have expired or already been used. You can also pay this extra at the counter with staff.
        </p>
        {slug ? (
          <Button asChild className="mt-6">
            <Link to={`/s/${slug}`}>Back to store</Link>
          </Button>
        ) : null}
      </div>
    )
  }

  const order = balanceQuery.data!

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{order.storeName ?? 'Store'}</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-fg">Order {order.reference}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Hi {order.customerName ?? 'there'} — the store added cards after checkout.
      </p>

      {paid ? (
        <div className="mt-8 rounded-xl border border-success-500/30 bg-success-50 px-4 py-5 text-success-800">
          <p className="text-lg font-bold">Payment received</p>
          <p className="mt-1 text-sm">Thanks — this order is paid in full.</p>
          {slug ? (
            <Button asChild variant="secondary" className="mt-4">
              <Link to={`/s/${slug}`}>Back to store</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm text-fg-muted">
            Order total {formatPrice(order.totalCents)} · paid {formatPrice(order.paidCents ?? 0)}
          </p>
          <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700">
            Approve {formatPrice(due)} on PayPal
          </p>
          {paypal?.enabled && paypal.clientId ? (
            <PaypalButtons
              clientId={paypal.clientId}
              merchantId={paypal.merchantId}
              environment={paypal.environment}
              currency={paypal.currency}
              amountCents={due}
              wallets={false}
              createOrder={createOrder}
              onApproved={onApproved}
            />
          ) : (
            <p className="text-sm text-fg-muted">PayPal checkout is unavailable — pay this amount at the counter.</p>
          )}
        </div>
      )}
    </div>
  )
}
