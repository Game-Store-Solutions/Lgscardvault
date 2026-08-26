import { Bell, Check, Coins, CreditCard, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router'
import type { CustomerNotification } from '../../api/types'
import { Button } from '../ui'
import { cx } from '../../lib/cx'

function notificationHref(notification: CustomerNotification): string {
  const store = notification.storeSlug ? `&store=${notification.storeSlug}` : ''
  const order = notification.orderId ? `&order=${notification.orderId}` : ''
  if (
    notification.type === 'sell_trade_completed'
    || notification.type === 'sell_trade_accepted'
    || notification.type === 'sell_trade_declined'
  ) {
    return notification.type === 'sell_trade_completed' && notification.body.toLowerCase().includes('store credit')
      ? `/account?section=credit${store}`
      : `/account?section=selltrade${store}`
  }
  if (notification.type === 'want_list_match') {
    return `/account?section=wantlist${store}`
  }
  return `/account?section=orders${store}${order}`
}

function isSellTrade(notification: CustomerNotification): boolean {
  return notification.type.startsWith('sell_trade_')
}

export function NotificationList({
  notifications,
  pendingId,
  onMarkRead,
  compact = false,
}: {
  notifications: CustomerNotification[]
  pendingId?: number
  onMarkRead: (id: number) => void
  compact?: boolean
}) {
  if (notifications.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-fg-muted">No unread notifications.</p>
  }

  return (
    <div className={cx('grid gap-2', compact && 'max-h-80 overflow-y-auto')}>
      {notifications.map((notification) => {
        const sellTrade = isSellTrade(notification)
        const Icon = sellTrade
          ? Coins
          : notification.type === 'want_list_match'
            ? ShoppingBag
            : notification.type === 'order_balance_due'
              ? CreditCard
              : Bell
        return (
          <div
            key={notification.id}
            className={cx(
              'flex items-start justify-between gap-3 rounded-btn border px-3 py-2',
              compact
                ? 'border-transparent bg-transparent hover:bg-bg'
                : sellTrade
                  ? 'border-brand-500/30 bg-brand-50'
                  : 'border-success-500/30 bg-success-50',
            )}
          >
            <Link
              to={notificationHref(notification)}
              className="flex min-w-0 gap-2"
              onClick={() => {
                if (notification.type !== 'order_balance_due') onMarkRead(notification.id)
              }}
            >
              {!compact && (
                <span
                  className={cx(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-btn',
                    sellTrade ? 'bg-brand-100 text-brand-700' : 'bg-success-100 text-success-700',
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                </span>
              )}
              <div className="min-w-0">
                <p
                  className={cx(
                    'truncate text-sm font-bold',
                    compact ? 'text-fg' : sellTrade ? 'text-brand-700' : 'text-success-700',
                  )}
                >
                  {notification.title}
                </p>
                <p
                  className={cx(
                    'text-sm leading-5',
                    compact
                      ? 'line-clamp-2 text-xs text-fg-muted'
                      : sellTrade
                        ? 'text-brand-700/90'
                        : 'text-success-700/90',
                  )}
                >
                  {notification.body}
                </p>
              </div>
            </Link>

            {compact ? (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                disabled={pendingId === notification.id}
                className="grid size-7 shrink-0 place-items-center rounded-btn text-fg-muted hover:bg-surface hover:text-success-700 disabled:opacity-50"
                aria-label={`Mark ${notification.title} as read`}
                title="Mark read"
              >
                <Check aria-hidden className="size-4" />
              </button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                loading={pendingId === notification.id}
                onClick={() => onMarkRead(notification.id)}
              >
                <Check aria-hidden className="size-4" />
                Read
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
