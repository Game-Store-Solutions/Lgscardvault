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

export function orderItemCount(order: Pick<Order, 'lines'>): number {
  return (order.lines ?? []).reduce((sum, line) => sum + line.quantity, 0)
}

export function formatOrderDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : '-'
}

export function formatOrderShortDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString() : '-'
}

export function orderLineImage(line: OrderLine): string | undefined {
  return cardImage({
    imageUrl: line.imageUrl ?? undefined,
    imageUris: line.imageUris ?? undefined,
  })
}
