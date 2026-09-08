import { ChevronDown, Store } from 'lucide-react'
import { Link } from 'react-router'
import { formatPrice } from '../../api/client'
import type { Order, OrderLine } from '../../api/types'
import { cx } from '../../lib/cx'
import {
  formatOrderShortDate,
  isClosedOrderStatus,
  orderItemCount,
  orderLineImage,
} from '../../lib/orders'
import { CardImage } from '../cards/CardImage'
import { OrderLineList } from './OrderLineList'
import { OrderBalanceDuePaypal } from './OrderBalanceDuePaypal'
import { OrderStatusBadge } from './OrderStatusBadge'
import { OrderWorkflow } from './OrderWorkflow'

const CARD_THUMB = 'h-[5.75rem] w-[4.1rem] shrink-0 rounded-xl sm:h-36 sm:w-[6.5rem]'

export function CustomerOrderCard({
  order,
  expanded,
  onToggle,
  compact = false,
  highlighted = false,
  onPaid,
}: {
  order: Order
  expanded: boolean
  onToggle: () => void
  /** Dense row for long cross-store lists (e.g. /account orders). */
  compact?: boolean
  highlighted?: boolean
  onPaid?: (order: Order) => void
}) {
  const itemCount = orderItemCount(order)
  const previewLines = (order.lines ?? []).slice(0, 3)
  const storeHref = order.storeSlug ? `/s/${order.storeSlug}` : undefined
  const lines = order.lines ?? []
  const thumbs = lines.map(orderLineImage).filter(Boolean).slice(0, 2) as string[]
  const extra = Math.max(0, lines.length - thumbs.length)
  const closed = isClosedOrderStatus(order.status)
  const primary = lines[0]
  const title =
    lines.length === 1 && primary?.cardName
      ? primary.cardName
      : (order.storeName ?? 'Store')

  if (compact) {
    return (
      <article
        id={`account-order-${order.id}`}
        className={cx(
          'rounded-xl transition-colors',
          expanded && 'bg-fg/[0.04]',
          highlighted && !expanded && 'ring-1 ring-brand-500/40',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-start gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-fg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:items-center sm:gap-5 sm:px-4 sm:py-3.5"
          aria-expanded={expanded}
        >
          <ThumbStack thumbs={thumbs} extra={extra} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-semibold text-fg sm:text-base">{title}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 truncate text-sm text-fg-muted">
              {lines.length === 1 ? (
                <>
                  {storeHref ? (
                    <Link
                      to={storeHref}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-fg-muted hover:text-brand-600 hover:underline"
                    >
                      {order.storeName ?? 'Store'}
                    </Link>
                  ) : (
                    <span>{order.storeName ?? 'Store'}</span>
                  )}
                  {primary?.setCode ? ` · ${primary.setCode.toUpperCase()}` : ''}
                  {primary?.collectorNumber ? ` #${primary.collectorNumber}` : ''}
                </>
              ) : (
                <>
                  {itemCount} {itemCount === 1 ? 'card' : 'cards'}
                  {order.storeName ? ` · ${order.storeName}` : ''}
                </>
              )}
            </p>
            <p className="mt-1 font-mono text-xs text-fg-muted">
              {order.reference}
              {' · '}
              {formatOrderShortDate(order.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5 sm:flex-row sm:items-center sm:gap-2 sm:pt-0">
            <span className="text-sm font-bold tabular-nums text-fg sm:text-lg">{formatPrice(order.totalCents)}</span>
            <ChevronDown
              aria-hidden
              className={cx('size-4 text-fg-muted transition-transform', expanded && 'rotate-180')}
            />
          </div>
        </button>

        {expanded && (
          <div className="space-y-4 px-1 pb-5 sm:px-4">
            {closed ? (
              <ClosedOrderNote order={order} />
            ) : (
              <OrderWorkflow status={order.status} />
            )}

            {lines.length > 1 ? (
              <CompactReceiptLines lines={lines} />
            ) : primary && (primary.quantity > 1 || (primary.caseQuantity ?? 0) > 0) ? (
              <SingleLineReceipt line={primary} />
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
              {storeHref ? (
                <Link to={storeHref} className="font-semibold text-brand-600 hover:underline">
                  Visit {order.storeName ?? 'store'}
                </Link>
              ) : (
                <span />
              )}
              {!closed ? <span className="text-fg-muted">Show {order.reference} at pickup</span> : null}
            </div>
            <OrderBalanceDuePaypal order={order} onPaid={onPaid ?? (() => undefined)} />
          </div>
        )}
      </article>
    )
  }

  return (
    <article className="rounded-card border border-border bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-4 p-4 text-left sm:flex-row sm:items-start sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-fg">
              <Store aria-hidden className="size-4 text-brand-600" />
              {order.storeName ?? 'This store'}
            </span>
            <span className="font-mono text-xs font-bold text-fg-muted">{order.reference}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatOrderShortDate(order.createdAt)}
          </p>

          {previewLines.length > 0 && (
            <div className="mt-3 flex -space-x-2">
              {previewLines.map((line) => (
                <CardThumb key={line.id} line={line} />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
          <p className="font-display text-2xl font-extrabold text-fg">{formatPrice(order.totalCents)}</p>
          <ChevronDown aria-hidden className={cx('size-5 text-fg-muted transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {!closed ? (
        <div className="border-t border-border px-4 py-3">
          <OrderWorkflow status={order.status} />
        </div>
      ) : null}

      {expanded && (
        <div className="border-t border-border bg-bg/60 p-4">
          {closed ? <ClosedOrderNote order={order} /> : null}
          <OrderLineList lines={order.lines ?? []} />
          <OrderBalanceDuePaypal order={order} onPaid={onPaid ?? (() => undefined)} />
        </div>
      )}
    </article>
  )
}

function ClosedOrderNote({ order }: { order: Order }) {
  return (
    <p className="text-sm leading-relaxed text-fg-muted">
      {order.status === 'refunded'
        ? 'This purchase was refunded and the original payment was returned.'
        : 'This order was cancelled and is closed.'}
    </p>
  )
}

function SingleLineReceipt({ line }: { line: OrderLine }) {
  return (
    <div className="text-sm text-fg-muted">
      {line.quantity > 1 ? (
        <p>
          {line.quantity} copies · {formatPrice(line.priceCents)} each
        </p>
      ) : null}
      {(line.caseQuantity ?? 0) > 0 && (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Case card · {line.caseName ?? 'Case'} / {line.sectionTitle ?? 'Section'}
        </p>
      )}
    </div>
  )
}

function CompactReceiptLines({ lines }: { lines: OrderLine[] }) {
  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => {
        const image = orderLineImage(line)
        return (
          <li key={line.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <CardImage
              src={image}
              alt={line.cardName}
              showLabel={false}
              className="h-24 w-[4.25rem] shrink-0 rounded-lg sm:h-28 sm:w-20"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{line.cardName}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {line.setCode ? `${line.setCode.toUpperCase()} · ` : ''}
                Qty {line.quantity} × {formatPrice(line.priceCents)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold tabular-nums text-fg">
              {formatPrice(line.quantity * line.priceCents)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function ThumbStack({ thumbs, extra }: { thumbs: string[]; extra: number }) {
  if (thumbs.length === 0) {
    return (
      <span
        className={cx(CARD_THUMB, 'shrink-0 bg-black/[0.04] ring-1 ring-border dark:bg-white/[0.06]')}
      />
    )
  }

  return (
    <span className="flex shrink-0 -space-x-4">
      {thumbs.map((src) => (
        <span key={src} className={cx(CARD_THUMB, 'overflow-hidden shadow-sm ring-2 ring-bg')}>
          <CardImage src={src} alt="" showLabel={false} className="size-full" />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className={cx(
            CARD_THUMB,
            'grid place-items-center bg-black/[0.04] text-sm font-bold text-fg-muted ring-2 ring-bg dark:bg-white/[0.06]',
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  )
}

function CardThumb({ line }: { line: OrderLine }) {
  const image = line.imageUris?.small ?? line.imageUris?.normal ?? line.imageUrl ?? undefined
  return (
    <span className="grid h-14 w-10 place-items-center overflow-hidden rounded-btn border border-border bg-bg ring-2 ring-surface">
      {image ? <img src={image} alt="" className="size-full object-cover" /> : <span className="text-xs font-bold text-fg-muted">?</span>}
    </span>
  )
}
