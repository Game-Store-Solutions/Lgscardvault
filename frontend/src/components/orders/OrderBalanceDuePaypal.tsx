import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api, { formatPrice } from '../../api/client'
import type { Order, StoreCheckoutConfig } from '../../api/types'
import { PaypalButtons } from '../payments/PaypalButtons'
import { invalidateCustomerNotifications } from '../../hooks'
import { orderBalanceDueCents, orderAllowsPaymentAdjustment } from '../../lib/orderManagementUi'

export function OrderBalanceDuePaypal({
  order,
  onPaid,
}: {
  order: Order
  onPaid: (order: Order) => void
}) {
  const queryClient = useQueryClient()
  const slug = order.storeSlug ?? ''
  const due = orderBalanceDueCents(order)
  const { data: config } = useQuery({
    queryKey: ['store-checkout-config', slug],
    queryFn: async () => (await api.get<StoreCheckoutConfig>(`/stores/${slug}/customer/checkout/config`)).data,
    enabled: Boolean(slug) && due > 0 && order.paymentProvider === 'paypal',
  })

  const createOrder = useCallback(async () => {
    const { data } = await api.post<{ orderId: string }>(
      `/stores/${slug}/customer/orders/${order.id}/paypal/order`,
    )
    if (!data.orderId) {
      throw new Error('PayPal did not return an order.')
    }
    return data.orderId
  }, [order.id, slug])

  const onApproved = useCallback(
    async (paypalOrderId: string) => {
      const { data } = await api.post<Order>(`/stores/${slug}/customer/orders/${order.id}/paypal/capture`, {
        paypalOrderId,
      })
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      invalidateCustomerNotifications(queryClient)
      onPaid(data)
    },
    [onPaid, order.id, queryClient, slug],
  )

  if (due < 1 || order.paymentProvider !== 'paypal' || !slug || !orderAllowsPaymentAdjustment(order)) {
    return null
  }

  if (!config?.paypal?.enabled) {
    return (
      <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700">
        {formatPrice(due)} extra is due. PayPal checkout is unavailable — pay this at the counter.
      </p>
    )
  }

  return (
    <div
      className="mt-3 space-y-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700">
        Approve {formatPrice(due)} on PayPal — the store added cards after checkout.
      </p>
      <PaypalButtons
        clientId={config.paypal.clientId}
        merchantId={config.paypal.merchantId}
        environment={config.paypal.environment}
        currency={config.paypal.currency}
        amountCents={due}
        wallets={false}
        createOrder={createOrder}
        onApproved={onApproved}
      />
    </div>
  )
}
