import { cardImage } from '../api/client'
import type { Order, OrderLine, OrderStatus } from '../api/types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  received: 'Accepted',
  fulfilled: 'Ready for pickup',
  paid: 'Accepted',
  shipped: 'Out for delivery',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export const ORDER_STATUS_TONES: Record<OrderStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  received: 'brand',
  fulfilled: 'success',
  paid: 'brand',
  shipped: 'brand',
  completed: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
}

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending', 'received', 'fulfilled', 'completed', 'cancelled', 'refunded']
export const ORDER_WORKFLOW: OrderStatus[] = ['pending', 'received', 'fulfilled', 'completed']

export function normalizeWorkflowStatus(status: OrderStatus): OrderStatus {
  if (status === 'paid') return 'received'
  if (status === 'shipped') return 'fulfilled'
  return status
}

/** Cancelled and refunded orders never continue the pickup pipeline. */
export function isClosedOrderStatus(status: OrderStatus): boolean {
  return status === 'cancelled' || status === 'refunded'
}

export function orderLines(order: Pick<Order, 'lines'>): OrderLine[] {
  return Array.isArray(order.lines) ? order.lines : []
}

export function orderItemCount(order: Pick<Order, 'lines'>): number {
  return orderLines(order).reduce((sum, line) => sum + line.quantity, 0)
}

export function formatOrderDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : '-'
}

export function formatOrderShortDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString() : '-'
}

/** Compact date + time for accept/decline queues and order lists. */
export function formatOrderDateTime(value?: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Staff-facing stamp: when the order was placed, or when it was accepted/declined. */
export function orderStatusTimestamp(order: Pick<Order, 'status' | 'createdAt' | 'statusChangedAt'>): string {
  const placed = formatOrderDateTime(order.createdAt)
  if (order.status === 'pending') return `Placed ${placed}`

  const decided = formatOrderDateTime(order.statusChangedAt ?? order.createdAt)
  if (order.status === 'received' || order.status === 'paid') return `Accepted ${decided}`
  if (order.status === 'cancelled') return `Declined ${decided}`
  if (order.status === 'refunded') return `Refunded ${decided}`

  return placed
}

export function orderLineImage(line: OrderLine): string | undefined {
  return cardImage({
    imageUrl: line.imageUrl ?? undefined,
    imageUris: line.imageUris ?? undefined,
  })
}
