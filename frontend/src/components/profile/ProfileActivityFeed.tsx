import { Link } from 'react-router'
import type { CustomerNotification, Order } from '../../api/types'
import { formatPrice, PROFILE_ACTIVITY_PAGE_SIZE } from '../../api/client'
import { formatRelativeTime } from '../../lib/format'
import { orderItemCount, orderLineImage } from '../../lib/orders'
import { OrderStatusBadge } from '../orders/OrderStatusBadge'
import { Pagination } from '../ui'

export function ProfileActivityFeed({
  orders,
  notifications,
  ordersTotal,
  page,
  onPageChange,
  onOpenOrders,
}: {
  orders: Order[]
  notifications: CustomerNotification[]
  ordersTotal: number
  page: number
  onPageChange: (page: number) => void
  onOpenOrders: (orderId?: number) => void
}) {
  const items = buildFeed(orders, page === 1 ? notifications : [])
  const pageCount = Math.max(1, Math.ceil(ordersTotal / PROFILE_ACTIVITY_PAGE_SIZE))

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight text-fg">Activity</h2>
        {ordersTotal > 0 ? (
          <button
            type="button"
            onClick={() => onOpenOrders()}
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            View orders
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-fg">No activity yet</p>
          <p className="mt-1 text-sm text-fg-muted">Orders and store updates will show up here.</p>
          <Link to="/stores" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Browse stores
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {items.map((item) =>
              item.kind === 'order' ? (
                <OrderRow key={`order-${item.order.id}`} order={item.order} onOpenOrders={onOpenOrders} />
              ) : (
                <NotificationRow
                  key={`note-${item.notification.id}`}
                  notification={item.notification}
                  onOpenOrders={onOpenOrders}
                />
              ),
            )}
          </ul>
          <Pagination
            className="mt-4 border-t border-border pt-4"
            page={page}
            pageCount={pageCount}
            onPageChange={onPageChange}
            totalItems={ordersTotal}
          />
        </>
      )}
    </section>
  )
}

function OrderRow({ order, onOpenOrders }: { order: Order; onOpenOrders: (orderId?: number) => void }) {
  const count = orderItemCount(order)
  const thumbs = (order.lines ?? []).map(orderLineImage).filter(Boolean).slice(0, 2) as string[]
  const extra = Math.max(0, (order.lines?.length ?? 0) - thumbs.length)

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenOrders(order.id)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-fg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:gap-4 sm:px-4 sm:py-4"
      >
        <ThumbStack thumbs={thumbs} extra={extra} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{orderHeadline(order)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <OrderStatusBadge status={order.status} />
            <span className="text-xs text-fg-muted">
              {count} {count === 1 ? 'card' : 'cards'}
              {order.storeName ? ` · ${order.storeName}` : ''}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-fg">{formatPrice(order.totalCents)}</span>
          <span className="mt-1 block text-xs text-fg-muted">{formatRelativeTime(order.createdAt)}</span>
        </span>
      </button>
    </li>
  )
}

function NotificationRow({
  notification,
  onOpenOrders,
}: {
  notification: CustomerNotification
  onOpenOrders: (orderId?: number) => void
}) {
  const body = (
    <>
      <p className="truncate text-sm font-semibold text-fg">{notification.title}</p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fg-muted">{notification.body}</p>
      <p className="mt-1 text-xs text-fg-muted">
        {formatRelativeTime(notification.createdAt)}
        {notification.storeName ? ` · ${notification.storeName}` : ''}
      </p>
    </>
  )

  if (notification.orderId) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onOpenOrders(notification.orderId ?? undefined)}
          className="w-full rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-fg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:px-4 sm:py-4"
        >
          {body}
        </button>
      </li>
    )
  }

  return <li className="rounded-xl px-3 py-3.5 sm:px-4 sm:py-4">{body}</li>
}

function ThumbStack({ thumbs, extra }: { thumbs: string[]; extra: number }) {
  if (thumbs.length === 0) {
    return <span className="h-14 w-10 shrink-0 rounded-lg bg-black/[0.04] ring-1 ring-border dark:bg-white/[0.06]" />
  }

  return (
    <span className="flex shrink-0 -space-x-2">
      {thumbs.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          className="h-14 w-10 rounded-lg object-cover ring-1 ring-border"
        />
      ))}
      {extra > 0 ? (
        <span className="grid h-14 w-10 place-items-center rounded-lg bg-black/[0.04] text-[10px] font-bold text-fg-muted ring-1 ring-border dark:bg-white/[0.06]">
          +{extra}
        </span>
      ) : null}
    </span>
  )
}

function orderHeadline(order: Order): string {
  const names = (order.lines ?? []).map((line) => line.cardName).filter(Boolean)
  if (names.length === 0) return order.reference
  if (names.length === 1) return names[0]
  return `${names[0]} + ${names.length - 1} more`
}

type FeedItem =
  | { kind: 'order'; at: number; order: Order }
  | { kind: 'notification'; at: number; notification: CustomerNotification }

function buildFeed(orders: Order[], notifications: CustomerNotification[]): FeedItem[] {
  const orderIds = new Set(orders.map((order) => order.id))
  const orderRefs = new Set(orders.map((order) => order.reference))
  const uniqueNotes = notifications.filter((notification) => {
    if (notification.orderId && orderIds.has(notification.orderId)) return false
    if (notification.orderReference && orderRefs.has(notification.orderReference)) return false
    return true
  })

  return [
    ...orders.map((order) => ({ kind: 'order' as const, at: Date.parse(order.createdAt), order })),
    ...uniqueNotes.map((notification) => ({
      kind: 'notification' as const,
      at: Date.parse(notification.createdAt),
      notification,
    })),
  ].sort((a, b) => b.at - a.at)
}
