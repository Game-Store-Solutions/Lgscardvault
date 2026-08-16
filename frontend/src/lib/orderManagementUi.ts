import type { Order, OrderStatus } from '../api/types'



export type OrderListTab = 'all' | 'pending' | 'processing' | 'delivery' | 'ready' | 'delivered'



export const ORDER_LIST_TABS: { id: OrderListTab; label: string }[] = [

  { id: 'all', label: 'All orders' },

  { id: 'pending', label: 'Pending' },

  { id: 'processing', label: 'Processing' },

  { id: 'delivery', label: 'Out for Delivery' },

  { id: 'ready', label: 'Ready for pickup' },

  { id: 'delivered', label: 'Delivered' },

]



const PROCESSING: OrderStatus[] = ['received', 'paid']

const DELIVERY: OrderStatus[] = ['shipped']

const READY: OrderStatus[] = ['fulfilled']

const DELIVERED: OrderStatus[] = ['completed']



export function orderMatchesTab(order: Order, tab: OrderListTab): boolean {

  if (tab === 'all') return true

  if (tab === 'pending') return order.status === 'pending'

  if (tab === 'processing') return PROCESSING.includes(order.status)

  if (tab === 'delivery') return DELIVERY.includes(order.status)

  if (tab === 'ready') return READY.includes(order.status)

  if (tab === 'delivered') return DELIVERED.includes(order.status)

  return true

}



/** Query param for GET /stores/{slug}/orders when filtering by admin tab. */

export function orderListTabQueueParam(tab: OrderListTab): string | undefined {

  return tab === 'all' ? undefined : tab

}



/** FreshCart-style status pill labels and colors. */

export function freshStatusPresentation(status: OrderStatus): { label: string; className: string } {

  switch (status) {

    case 'pending':

      return { label: 'Pending', className: 'bg-warning-50 text-warning-700' }

    case 'received':

    case 'paid':

      return { label: 'Accepted', className: 'bg-brand-50 text-brand-700' }

    case 'shipped':

      return { label: 'Out for delivery', className: 'bg-brand-100 text-brand-700' }

    case 'fulfilled':

      return { label: 'Ready for pickup', className: 'bg-success-50 text-success-700' }

    case 'completed':

      return { label: 'Delivered', className: 'bg-success-50 text-success-700' }

    case 'cancelled':

    case 'refunded':

      return { label: 'Cancelled', className: 'bg-danger-50 text-danger-700' }

    default:

      return { label: status, className: 'bg-bg text-fg-muted' }

  }

}



export function customerTierLabel(order: Order): string {

  if (order.channel === 'kiosk') return 'Kiosk'

  return 'Online'

}



export function paymentSubtitle(order: Order): string {

  if (order.channel === 'kiosk') return 'Paid in store'

  const credit = order.creditAppliedCents ?? 0

  if (credit > 0 && credit >= order.totalCents) return 'Paid with store credit'

  if (credit > 0) return 'Card + store credit'

  if (order.status === 'pending') return 'Awaiting payment'

  return 'Paid by card'

}



export function orderPrimaryProductName(order: Order): string {

  const lines = order.lines ?? []

  if (lines.length === 0) return 'Order items'

  if (lines.length === 1) return lines[0].cardName

  return lines[0].cardName

}



export function countOrdersBetween(orders: Order[], fromMs: number, toMs: number): number {

  return orders.filter((order) => {

    const t = new Date(order.createdAt).getTime()

    return t >= fromMs && t < toMs

  }).length

}



/** Percent change vs previous period; null when previous is 0. */

export function percentChange(current: number, previous: number): number | null {

  if (previous === 0) return current > 0 ? 100 : null

  return Math.round(((current - previous) / previous) * 100)

}



const CLOSED_STORE_ORDER_STATUSES: OrderStatus[] = ['completed', 'cancelled', 'refunded']



/** Admin Commerce nav badge — open until delivered or closed. */

export function isOpenStoreOrder(order: Pick<Order, 'status'>): boolean {

  return !CLOSED_STORE_ORDER_STATUSES.includes(order.status)

}

