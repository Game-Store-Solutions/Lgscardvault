import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  EllipsisVertical,
  Monitor,
  Package,
  PackageCheck,
  Plus,
  Minus,
  Printer,
  Banknote,
  ReceiptText,
  RotateCcw,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, httpStatus } from '../../api/client'
import type { InventoryItem, Order, OrderChannel, OrderLine, OrderStatus } from '../../api/types'
import { inventoryKey, openStoreOrdersCountKey, ordersKey, resolveOrdersListTotal, useDebouncedValue, useInventoryPage, useOrders, useStoreOrderQueueCounts } from '../../hooks'
import { Avatar, Button, EmptyState, ErrorState, Input, LoadingPanel, Modal, Select, Skeleton, dropdownPanelClass } from '../../components/ui'
import { OrderLineList } from '../../components/orders/OrderLineList'
import { OrderWorkflow } from '../../components/orders/OrderWorkflow'
import { cx } from '../../lib/cx'
import {
  ORDER_LIST_TABS,
  customerTierLabel,
  freshStatusPresentation,
  orderAllowsLineEdits,
  orderBalanceDueCents,
  orderIsHistoricalImport,
  orderCreditOwedCents,
  orderPrimaryProductName,
  paymentSubtitle,
  percentChange,
  type OrderListTab,
} from '../../lib/orderManagementUi'
import { formatOrderDate, formatOrderShortDate, orderItemCount, orderLineImage } from '../../lib/orders'
import { printOrderSheet } from '../../lib/printOrderSheet'
import { rankInventorySearch } from '../../lib/rankInventorySearch'
import { AnimatePresence, EASE_PREMIUM, motion } from '../../components/motion'

const PAGE_SIZE = 8
/** Compact accept strip — keep short so browse stays primary. */
const NEEDS_ACCEPT_PREVIEW = 6
/** Keeps pagination from jumping when the last page has fewer rows. */
const ORDER_TABLE_ROW_H = 'h-[4.75rem]'
const ADD_CARD_SEARCH_MIN = 2
/** Tailwind `lg` — desktop order table vs mobile cards. */
const LG_MQ = '(min-width: 1024px)'

function subscribeLg(onChange: () => void) {
  const mq = window.matchMedia(LG_MQ)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function useIsLg(): boolean {
  return useSyncExternalStore(subscribeLg, () => window.matchMedia(LG_MQ).matches, () => false)
}

function statusActions(status: OrderStatus): { status: OrderStatus; label: string; icon: typeof CheckCircle2 }[] {
  if (status === 'pending') {
    return [
      { status: 'received', label: 'Accept order', icon: CheckCircle2 },
      { status: 'cancelled', label: 'Cancel', icon: XCircle },
    ]
  }
  if (status === 'received' || status === 'paid' || status === 'shipped') {
    return [
      { status: 'fulfilled', label: 'Ready for pickup', icon: PackageCheck },
      { status: 'refunded', label: 'Refund', icon: RotateCcw },
    ]
  }
  if (status === 'fulfilled') {
    return [
      { status: 'completed', label: 'Mark delivered', icon: CheckCircle2 },
      { status: 'refunded', label: 'Refund', icon: RotateCcw },
    ]
  }
  if (status === 'completed') {
    return [{ status: 'refunded', label: 'Refund', icon: RotateCcw }]
  }
  return []
}

/** Next statuses staff can move this order to (mirrors the server state machine + balance rules). */
function orderStatusChoices(order: Order): { status: OrderStatus; label: string; icon: typeof CheckCircle2 }[] {
  const balanceDue = orderBalanceDueCents(order)
  const historicalImport = orderIsHistoricalImport(order)
  // Only hold Ready / Delivered when an online capture is still owed. Pay-in-store
  // and unpaid counter orders must still advance so staff can collect at pickup.
  const onlineBalanceBlocksFulfillment =
    balanceDue > 0 &&
    !historicalImport &&
    (order.paymentProvider === 'paypal' || order.paymentProvider === 'square')

  return statusActions(order.status).filter(
    (action) =>
      !(onlineBalanceBlocksFulfillment && (action.status === 'fulfilled' || action.status === 'completed')),
  )
}

function OrderStatusSelect({
  order,
  pending,
  onUpdateStatus,
  size = 'sm',
}: {
  order: Order
  pending: boolean
  onUpdateStatus: (status: OrderStatus) => void
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const statusUi = freshStatusPresentation(order.status)
  const choices = orderStatusChoices(order)
  const canChange = choices.length > 0 && !order.disputeStatus

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const width = Math.max(rect.width, 260)
      const menuHeight = menu?.offsetHeight ?? 160
      const gap = 6
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const fitsBelow = rect.bottom + gap + menuHeight <= window.innerHeight - 8
      const top = fitsBelow ? rect.bottom + gap : Math.max(8, rect.top - gap - menuHeight)
      setCoords({ top, left, width })
    }
    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, choices.length])

  const pill = (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1 truncate rounded-lg font-bold',
        size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs',
        statusUi.className,
      )}
    >
      {statusUi.label}
      {canChange ? (
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18, ease: EASE_PREMIUM }}
          className="inline-flex shrink-0"
        >
          <ChevronDown className={cx('opacity-80', size === 'md' ? 'size-4' : 'size-3.5')} />
        </motion.span>
      ) : null}
    </span>
  )

  if (!canChange) {
    return pill
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Change status, currently ${statusUi.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="inline-flex max-w-full rounded-lg disabled:opacity-60"
      >
        {pill}
      </button>
      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={menuRef}
                  role="listbox"
                  aria-label="Order status"
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.985 }}
                  transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                  style={
                    coords
                      ? { position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 80 }
                      : { position: 'fixed', visibility: 'hidden', zIndex: 80 }
                  }
                  className={cx(dropdownPanelClass, 'origin-top p-1.5')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div role="option" aria-selected className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                    <Check aria-hidden className="size-4 shrink-0 text-fg" />
                    <span className={cx('inline-flex rounded-lg px-2.5 py-1 text-xs font-bold', statusUi.className)}>
                      {statusUi.label}
                    </span>
                  </div>
                  <div className="my-1 border-t border-border" />
                  {choices.map(({ status, label, icon: Icon }, index) => {
                    const nextUi = freshStatusPresentation(status)
                    return (
                      <motion.button
                        key={status}
                        type="button"
                        role="option"
                        aria-label={label}
                        aria-selected={false}
                        disabled={pending}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.14, delay: 0.03 + index * 0.03, ease: EASE_PREMIUM }}
                        whileHover={{ x: 2 }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-bg disabled:opacity-50"
                        onClick={() => {
                          setOpen(false)
                          onUpdateStatus(status)
                        }}
                      >
                        <Icon aria-hidden className="size-4 shrink-0 text-fg-muted" />
                        <span className={cx('inline-flex rounded-lg px-2.5 py-1 text-xs font-bold', nextUi.className)}>
                          {nextUi.label}
                        </span>
                      </motion.button>
                    )
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  )
}

function PendingAcceptQueue({
  orders,
  totalCount,
  acceptingOrderId,
  onAccept,
  onOpenDetail,
  onViewAll,
}: {
  orders: Order[]
  totalCount: number
  acceptingOrderId: number | null
  onAccept: (order: Order) => void
  onOpenDetail: (order: Order) => void
  onViewAll: () => void
}) {
  if (totalCount <= 0 || orders.length === 0) return null

  return (
    <section className="min-w-0 overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-bold text-fg sm:text-lg">New orders</h2>
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-700 px-1.5 text-[11px] font-bold tabular-nums leading-none text-brand-100">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">Accept to start pulling cards</p>
        </div>
        {totalCount > orders.length ? (
          <Button size="sm" variant="ghost" onClick={onViewAll}>
            View all
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {orders.map((order) => {
          const firstLine = order.lines?.[0]
          const thumb = firstLine ? orderLineImage(firstLine) : undefined
          const accepting = acceptingOrderId === order.id
          return (
            <motion.li
              key={order.id}
              initial={false}
              whileHover={{ x: 3 }}
              transition={{ duration: 0.2, ease: EASE_PREMIUM }}
              className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-bg/80 sm:gap-4 sm:px-5"
            >
              <button
                type="button"
                onClick={() => onOpenDetail(order)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4"
              >
                <motion.span
                  className="grid size-11 shrink-0 overflow-hidden rounded-xl bg-bg"
                  whileHover={{ scale: 1.04 }}
                  transition={{ duration: 0.2, ease: EASE_PREMIUM }}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-fg-muted">
                      <Package aria-hidden className="size-5" />
                    </span>
                  )}
                </motion.span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate font-semibold text-fg">{orderPrimaryProductName(order)}</span>
                  <span className="block truncate text-sm text-fg-muted">
                    {order.customerName ?? 'Guest'} · {order.reference}
                  </span>
                  <span className="block text-sm font-semibold tabular-nums text-fg">{formatPrice(order.totalCents)}</span>
                </span>
              </button>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.16, ease: EASE_PREMIUM }}>
                <Button
                  size="sm"
                  loading={accepting}
                  disabled={acceptingOrderId != null && !accepting}
                  onClick={() => onAccept(order)}
                  className="shrink-0"
                >
                  <CheckCircle2 aria-hidden className="size-4" />
                  Accept
                </Button>
              </motion.div>
            </motion.li>
          )
        })}
      </ul>
      {totalCount > orders.length ? (
        <div className="border-t border-border px-4 py-3.5 sm:px-5">
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View all {totalCount} new orders →
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default function OrdersTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<OrderListTab>('all')
  const {
    data: pageData,
    isPending,
    isFetching,
    error,
    refetch: refetchOrders,
  } = useOrders(slug, page, PAGE_SIZE, statusFilter)
  const { data: queueCounts, refetch: refetchQueueCounts } = useStoreOrderQueueCounts(slug)
  const pendingTotal = queueCounts?.pending ?? 0
  const showNeedsAccept = pendingTotal > 0 && statusFilter !== 'pending'
  const { data: needsAcceptPage } = useOrders(slug, 1, NEEDS_ACCEPT_PREVIEW, 'pending')
  const data = pageData?.items ?? []
  const orderTotal = pageData?.total ?? 0
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [channelFilter, setChannelFilter] = useState<OrderChannel | 'all'>('all')
  const [kioskOpen, setKioskOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [menuOrderId, setMenuOrderId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const ordersListRef = useRef<HTMLElement | null>(null)
  const isLg = useIsLg()

  const needsAcceptOrders = useMemo(() => {
    if (!showNeedsAccept) return []
    return (needsAcceptPage?.items ?? [])
      .filter((order) => order.status === 'pending')
      .slice(0, NEEDS_ACCEPT_PREVIEW)
  }, [showNeedsAccept, needsAcceptPage?.items])

  useEffect(() => {
    setMenuOrderId(null)
  }, [isLg])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[aria-label="Order actions"]')) return
      setMenuOrderId(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOrderId(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return data
      .filter((order) => channelFilter === 'all' || (order.channel ?? 'online') === channelFilter)
      .filter((order) => {
        if (!q) return true
        const hay = [
          order.reference,
          order.customerName,
          order.customerEmail,
          ...(order.lines ?? []).map((l) => l.cardName),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [data, channelFilter, debouncedSearch])

  useEffect(() => setPage(1), [statusFilter, channelFilter, debouncedSearch])

  const refreshOrdersAndCounts = () => {
    void queryClient.invalidateQueries({ queryKey: ordersKey(slug) })
    void refetchQueueCounts()
    void refetchOrders()
  }

  const viewAllPending = () => {
    setStatusFilter('pending')
    setPage(1)
    requestAnimationFrame(() => {
      ordersListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const listTotal = resolveOrdersListTotal(statusFilter, orderTotal, queueCounts)
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE))
  const pageOrders = filtered
  const listEmpty = pageOrders.length === 0
  const listFetching = isFetching

  const stats = useMemo(() => {
    const today = queueCounts?.today
    const yesterday = queueCounts?.yesterday
    const fulfilledToday = (today?.completed ?? 0) + (today?.ready ?? 0)
    const fulfilledYesterday = (yesterday?.completed ?? 0) + (yesterday?.ready ?? 0)
    return {
      newOrders: today?.new ?? 0,
      newTrend: percentChange(today?.new ?? 0, yesterday?.new ?? 0),
      pending: today?.pending ?? 0,
      pendingTrend: percentChange(today?.pending ?? 0, yesterday?.pending ?? 0),
      fulfilled: fulfilledToday,
      fulfilledTrend: percentChange(fulfilledToday, fulfilledYesterday),
      canceled: today?.canceled ?? 0,
      canceledTrend: percentChange(today?.canceled ?? 0, yesterday?.canceled ?? 0),
    }
  }, [queueCounts?.today, queueCounts?.yesterday])

  const updateStatus = useMutation({
    mutationFn: async ({ order, status }: { order: Order; status: OrderStatus }) => {
      const { data: updated } = await api.patch<Order>(`/stores/${slug}/orders/${order.id}`, { status })
      return updated
    },
    onSuccess: (updated) => {
      setDetailOrder((current) => (current?.id === updated.id ? updated : current))
      setMenuOrderId(null)
      refreshOrdersAndCounts()
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: openStoreOrdersCountKey(slug) })
      void queryClient.invalidateQueries({ queryKey: ordersKey(slug) })
    },
  })

  const orderListItemProps = (order: Order): OrderListItemProps => ({
    order,
    menuOpen: menuOrderId === order.id,
    menuRef: menuOrderId === order.id ? menuRef : undefined,
    onToggleMenu: () => setMenuOrderId((id) => (id === order.id ? null : order.id)),
    onOpenDetail: () => {
      setDetailOrder(order)
      setMenuOrderId(null)
    },
    onPrint: () => {
      void printOrderSheet(order, slug).then((updated) => {
        if ((updated.taxCents ?? 0) !== (order.taxCents ?? 0)) {
          void queryClient.invalidateQueries({ queryKey: ordersKey(slug) })
        }
      })
    },
    onUpdateStatus: (s) => updateStatus.mutate({ order, status: s }),
    updatePending: updateStatus.isPending && updateStatus.variables?.order.id === order.id,
  })

  const status = httpStatus(error)
  const endpointMissing = status === 404 || status === 405
  const listLoading = isPending

  if (endpointMissing) {
    return (
      <div className="rounded-2xl bg-bg p-6">
        <EmptyState
          icon={ReceiptText}
          title="Orders backend not available yet"
          description={
            <>
              This page expects a <code className="text-fg">GET /api/stores/{slug}/orders</code> endpoint.
            </>
          }
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-bg p-6">
        <ErrorState title="Failed to load orders" description="Please try again." onRetry={() => void refreshOrdersAndCounts()} />
      </div>
    )
  }

  return (
    <div className="-mt-4 w-full min-w-0 space-y-5 pb-10 pt-2 sm:space-y-6">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Order Management</h1>
        <p className="mt-1 text-sm text-fg-muted">Today’s order totals and live queue — compared to yesterday.</p>
      </header>

      {updateStatus.isError && (
        <p role="alert" className="rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
          {extractErrorMessage(updateStatus.error, 'Could not update order status.')}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          iconClass="bg-brand-50 text-brand-600"
          label="Orders today"
          value={String(stats.newOrders)}
          trend={stats.newTrend}
        />
        <StatCard
          icon={Package}
          iconClass="bg-warning-50 text-warning-700"
          label="Pending today"
          value={String(stats.pending)}
          trend={stats.pendingTrend}
          trendNegative
        />
        <StatCard
          icon={CheckCircle2}
          iconClass="bg-success-50 text-success-700"
          label="Ready / delivered today"
          value={String(stats.fulfilled)}
          trend={stats.fulfilledTrend}
        />
        <StatCard
          icon={XCircle}
          iconClass="bg-danger-50 text-danger-700"
          label="Canceled today"
          value={String(stats.canceled)}
          trend={stats.canceledTrend}
          trendNegative
        />
      </div>

      {showNeedsAccept ? (
        <PendingAcceptQueue
          orders={needsAcceptOrders}
          totalCount={pendingTotal}
          acceptingOrderId={
            updateStatus.isPending && updateStatus.variables?.status === 'received'
              ? updateStatus.variables.order.id
              : null
          }
          onAccept={(order) => updateStatus.mutate({ order, status: 'received' })}
          onOpenDetail={(order) => setDetailOrder(order)}
          onViewAll={viewAllPending}
        />
      ) : null}

      <section ref={ordersListRef} className="min-w-0 rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-5">
          <h2 className="text-base font-bold text-fg sm:text-lg">Orders</h2>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setKioskOpen(true)}>
            <Plus aria-hidden className="size-4" />
            Add Order
          </Button>
        </div>

        <div className="flex flex-col gap-3 px-4 pb-4 sm:gap-4 sm:px-5 sm:flex-row sm:items-center sm:justify-end sm:pb-5">
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:max-w-3xl lg:flex-1 lg:justify-end">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orders…"
                className="h-10 w-full rounded-[var(--radius-input)] border border-border bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderListTab)}
              wrapperClassName="w-full shrink-0 sm:w-[11.5rem]"
              className="h-10 w-full"
            >
              {ORDER_LIST_TABS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as OrderChannel | 'all')}
              wrapperClassName="w-full shrink-0 sm:w-[9.5rem]"
              className="h-10 w-full"
            >
              <option value="all">All channels</option>
              <option value="online">Online</option>
              <option value="kiosk">Kiosk</option>
            </Select>
          </div>
        </div>

        {listLoading ? (
          <>
            <OrdersCardSkeleton />
            <OrdersTableSkeleton />
          </>
        ) : orderTotal === 0 ? (
          <div className="px-4 py-12 sm:px-5 sm:py-16">
            <EmptyState
              icon={ReceiptText}
              title="No orders yet"
              description="Online orders will appear here. Or ring up the first sale at the kiosk."
              action={
                <Button size="sm" onClick={() => setKioskOpen(true)}>
                  <Monitor className="size-4" aria-hidden />
                  New kiosk order
                </Button>
              }
            />
          </div>
        ) : listEmpty ? (
          <p className="px-4 py-12 text-center text-sm text-fg-muted sm:px-5 sm:py-16">No orders match this filter.</p>
        ) : (
          <>
            {!isLg ? (
              <div
                className={cx(
                  'divide-y divide-border',
                  listFetching && 'opacity-60 transition-opacity duration-150',
                )}
              >
                {pageOrders.map((order) => (
                  <OrderCard key={order.id} {...orderListItemProps(order)} />
                ))}
              </div>
            ) : (
              <div className="relative min-w-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] table-fixed text-left text-sm">
                    <OrdersTableHead />
                    <tbody
                      className={cx('min-h-0 transition-opacity duration-150', listFetching && 'opacity-60')}
                    >
                      {pageOrders.map((order) => (
                        <OrderRow key={order.id} {...orderListItemProps(order)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </section>

      {kioskOpen && <KioskOrderModal slug={slug} onClose={() => setKioskOpen(false)} />}
      {detailOrder && (
        <OrderDetailModal
          slug={slug}
          order={detailOrder}
          pendingStatus={updateStatus.variables?.order.id === detailOrder.id ? updateStatus.variables.status : null}
          error={updateStatus.error}
          onClose={() => setDetailOrder(null)}
          onOrderChange={setDetailOrder}
          onUpdateStatus={(status) => updateStatus.mutate({ order: detailOrder, status })}
        />
      )}
    </div>
  )
}

function OrdersTableHead() {
  return (
    <thead>
      <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <th className="w-[28%] min-w-0 px-5 py-3 font-semibold">Product Name</th>
        <th className="w-[20%] min-w-0 px-5 py-3 font-semibold">Customer Name</th>
        <th className="w-[14%] min-w-0 px-5 py-3 font-semibold">Order Id</th>
        <th className="w-[12%] min-w-0 px-5 py-3 font-semibold">Amount</th>
        <th className="w-[12%] min-w-0 px-5 py-3 font-semibold">Status</th>
        <th className="w-16 px-3 py-3 font-semibold text-right">Action</th>
      </tr>
    </thead>
  )
}

function OrdersCardSkeleton({ rows = PAGE_SIZE }: { rows?: number }) {
  return (
    <div className="divide-y divide-border lg:hidden" aria-busy="true" aria-label="Loading orders">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 px-4 py-4">
          <Skeleton className="size-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-6 w-20 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function OrdersTableSkeleton({ rows = PAGE_SIZE }: { rows?: number }) {
  return (
    <div className="relative hidden min-w-0 lg:block" aria-busy="true" aria-label="Loading orders">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] table-fixed text-left text-sm">
          <OrdersTableHead />
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className={cx('border-b border-border/60', ORDER_TABLE_ROW_H)}>
                <td className="px-5 py-4 align-middle">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-11 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <Skeleton className="h-6 w-20 rounded-lg" />
                </td>
                <td className="px-3 py-4 align-middle text-right">
                  <Skeleton className="ml-auto size-9 rounded-lg" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  trend,
  trendNegative = false,
}: {
  icon: LucideIcon
  iconClass: string
  label: string
  value: string
  trend: number | null
  trendNegative?: boolean
}) {
  const showTrend = trend !== null
  const positive = trend !== null && trend >= 0
  const badgeClass = showTrend
    ? positive && !trendNegative
      ? 'bg-brand-100 text-brand-700'
      : 'bg-danger-50 text-danger-700'
    : ''

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:gap-4 sm:p-5">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-2xl sm:size-12', iconClass)}>
        <Icon aria-hidden className="size-5 sm:size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-fg-muted sm:text-sm">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="font-display text-xl font-bold text-fg sm:text-2xl">{value}</p>
          {showTrend && (
            <span className={cx('rounded-md px-1.5 py-0.5 text-xs font-bold', badgeClass)}>
              {trend > 0 ? '+' : ''}
              {trend}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

type OrderListItemProps = {
  order: Order
  menuOpen: boolean
  menuRef?: React.RefObject<HTMLDivElement | null>
  onToggleMenu: () => void
  onOpenDetail: () => void
  onPrint: () => void
  onUpdateStatus: (status: OrderStatus) => void
  updatePending: boolean
}

function OrderCard({
  order,
  menuOpen,
  menuRef,
  onToggleMenu,
  onOpenDetail,
  onPrint,
  onUpdateStatus,
  updatePending,
}: OrderListItemProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstLine = order.lines?.[0]
  const thumb = firstLine ? orderLineImage(firstLine) : undefined
  const actions = orderStatusChoices(order)
  const itemCount = orderItemCount(order)

  return (
    <article className="px-4 py-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpenDetail} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="grid size-12 shrink-0 overflow-hidden rounded-xl bg-bg">
            {thumb ? (
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-fg-muted">
                <Package aria-hidden className="size-5" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-fg">{orderPrimaryProductName(order)}</span>
            <span className="mt-0.5 block truncate text-sm text-fg-muted">
              {order.customerName ?? 'Guest'} · {order.reference}
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              {formatOrderShortDate(order.createdAt)} · {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-fg">{formatPrice(order.totalCents)}</span>
              <span className="text-xs text-fg-muted">{paymentSubtitle(order)}</span>
            </span>
            {order.disputeStatus ? (
              <span className="mt-1 block text-xs font-bold text-danger-700">
                Dispute · {order.disputeReason || order.disputeStatus}
              </span>
            ) : null}
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <OrderStatusSelect order={order} pending={updatePending} onUpdateStatus={onUpdateStatus} />
          <button
            ref={triggerRef}
            type="button"
            aria-label="Order actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={onToggleMenu}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-bg"
          >
            <EllipsisVertical aria-hidden className="size-5" />
          </button>
        </div>
      </div>
      {menuOpen && menuRef ? (
        <OrderActionsMenu
          menuRef={menuRef}
          triggerRef={triggerRef}
          onOpenDetail={onOpenDetail}
          onPrint={onPrint}
          actions={actions}
          updatePending={updatePending}
          onUpdateStatus={onUpdateStatus}
        />
      ) : null}
    </article>
  )
}

function OrderRow({
  order,
  menuOpen,
  menuRef,
  onToggleMenu,
  onOpenDetail,
  onPrint,
  onUpdateStatus,
  updatePending,
}: OrderListItemProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstLine = order.lines?.[0]
  const thumb = firstLine ? orderLineImage(firstLine) : undefined
  const actions = orderStatusChoices(order)
  const itemCount = orderItemCount(order)

  return (
    <tr className={cx('border-b border-border/60 transition-colors hover:bg-bg/80', ORDER_TABLE_ROW_H)}>
      <td className="min-w-0 overflow-hidden px-5 py-4 align-middle">
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex w-full min-w-0 max-w-full items-center gap-3 text-left"
        >
          <span className="grid size-11 shrink-0 overflow-hidden rounded-xl bg-bg">
            {thumb ? (
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-fg-muted">
                <Package aria-hidden className="size-5" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate font-semibold text-fg">{orderPrimaryProductName(order)}</span>
            <span className="block truncate text-xs text-fg-muted">Items {itemCount}</span>
          </span>
        </button>
      </td>
      <td className="min-w-0 overflow-hidden px-5 py-4 align-middle">
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <Avatar name={order.customerName ?? 'Guest'} size="sm" className="shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate font-semibold text-fg">{order.customerName ?? 'Guest'}</p>
            <p className="truncate text-xs text-fg-muted">{customerTierLabel(order)}</p>
          </div>
        </div>
      </td>
      <td className="min-w-0 overflow-hidden px-5 py-4 align-middle">
        <p className="truncate font-semibold text-fg">{order.reference}</p>
        <p className="truncate text-xs text-fg-muted">{formatOrderShortDate(order.createdAt)}</p>
      </td>
      <td className="min-w-0 overflow-hidden px-5 py-4 align-middle">
        <p className="truncate font-bold text-fg">{formatPrice(order.totalCents)}</p>
        <p className="truncate text-xs text-fg-muted">{paymentSubtitle(order)}</p>
      </td>
      <td className="min-w-0 overflow-hidden px-5 py-4 align-middle">
        <OrderStatusSelect order={order} pending={updatePending} onUpdateStatus={onUpdateStatus} />
        {order.disputeStatus && (
          <p className="mt-1 truncate text-xs font-bold text-danger-700">Dispute · {order.disputeReason || order.disputeStatus}</p>
        )}
      </td>
      <td className="w-16 shrink-0 px-3 py-4 align-middle text-right">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Order actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={onToggleMenu}
          className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-bg"
        >
          <EllipsisVertical aria-hidden className="size-5" />
        </button>
        {menuOpen && menuRef ? (
          <OrderActionsMenu
            menuRef={menuRef}
            triggerRef={triggerRef}
            onOpenDetail={onOpenDetail}
            onPrint={onPrint}
            actions={actions}
            updatePending={updatePending}
            onUpdateStatus={onUpdateStatus}
          />
        ) : null}
      </td>
    </tr>
  )
}

const ORDER_ACTIONS_MENU_WIDTH = 176

function OrderActionsMenu({
  menuRef,
  triggerRef,
  onOpenDetail,
  onPrint,
  actions,
  updatePending,
  onUpdateStatus,
}: {
  menuRef: RefObject<HTMLDivElement | null>
  triggerRef: RefObject<HTMLButtonElement | null>
  onOpenDetail: () => void
  onPrint: () => void
  actions: { status: OrderStatus; label: string }[]
  updatePending: boolean
  onUpdateStatus: (status: OrderStatus) => void
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const placeMenu = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      // Hidden responsive twin (display:none) reports a zero box — skip it.
      if (rect.width === 0 && rect.height === 0) return
      const menuHeight = menu?.offsetHeight ?? 120
      const gap = 6
      const left = Math.max(
        8,
        Math.min(rect.right - ORDER_ACTIONS_MENU_WIDTH, window.innerWidth - ORDER_ACTIONS_MENU_WIDTH - 8),
      )
      const fitsBelow = rect.bottom + gap + menuHeight <= window.innerHeight - 8
      const top = fitsBelow ? rect.bottom + gap : Math.max(8, rect.top - gap - menuHeight)
      setCoords({ top, left })
    }

    placeMenu()
    const raf = requestAnimationFrame(placeMenu)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [actions.length, menuRef, triggerRef])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={coords ? { position: 'fixed', top: coords.top, left: coords.left, zIndex: 80 } : { position: 'fixed', visibility: 'hidden', zIndex: 80 }}
      className="w-44 rounded-xl border border-border bg-surface py-1 text-left shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg"
        onClick={onOpenDetail}
      >
        View details
      </button>
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg"
        onClick={onPrint}
      >
        Print sheet
      </button>
      {actions.map(({ status, label }) => (
        <button
          key={status}
          type="button"
          role="menuitem"
          disabled={updatePending}
          className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg disabled:opacity-50"
          onClick={() => onUpdateStatus(status)}
        >
          {label}
        </button>
      ))}
    </div>,
    document.body,
  )
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const set = new Set<number>([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages))
    return [...set].sort((a, b) => a - b)
  }, [page, totalPages])

  return (
    <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted disabled:opacity-40 hover:bg-bg"
      >
        <ChevronLeft aria-hidden className="size-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      <div className="flex max-w-[min(100%,18rem)] flex-wrap items-center justify-center gap-1 sm:max-w-none">
        {pages.map((p, index) => (
          <span key={p} className="flex items-center gap-1">
            {index > 0 && pages[index - 1] !== p - 1 && <span className="px-1 text-fg-muted">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              className={cx(
                'grid size-9 place-items-center rounded-lg text-sm font-bold',
                p === page ? 'bg-brand-500 text-white' : 'text-fg-muted hover:bg-bg',
              )}
            >
              {p}
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted disabled:opacity-40 hover:bg-bg"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </div>
  )
}

function OrderDetailModal({
  slug,
  order,
  pendingStatus,
  error,
  onClose,
  onOrderChange,
  onUpdateStatus,
}: {
  slug: string
  order: Order
  pendingStatus: OrderStatus | null
  error: unknown
  onClose: () => void
  onOrderChange: (order: Order) => void
  onUpdateStatus: (status: OrderStatus) => void
}) {
  const queryClient = useQueryClient()
  const balanceDue = orderBalanceDueCents(order)
  const actions = orderStatusChoices(order)
  const canEdit = orderAllowsLineEdits(order.status, order.disputeStatus)
  const [addQuery, setAddQuery] = useState('')
  const [lineError, setLineError] = useState('')
  const [busyLineId, setBusyLineId] = useState<number | null>(null)
  const addTerm = useDebouncedValue(addQuery, 150)
  const addSearchReady = addTerm.trim().length >= ADD_CARD_SEARCH_MIN
  const { data: addSearch, isFetching: addSearching } = useInventoryPage(slug, {
    q: addTerm.trim(),
    inStockOnly: true,
    itemsPerPage: 24,
    enabled: canEdit && addSearchReady,
    keepPreviousData: false,
  })
  const addResults = addSearchReady ? rankInventorySearch(addSearch?.items ?? [], addTerm) : []
  const creditOwed = orderCreditOwedCents(order)
  const capturedOnline = (order.paidCents ?? 0) > 0
  const paypalOrder = order.paymentProvider === 'paypal'
  const awaitingShopperPayment = canEdit && paypalOrder && balanceDue > 0

  const { data: liveOrder } = useQuery({
    queryKey: ['store-order-detail', slug, order.id],
    queryFn: async () => (await api.get<Order>(`/stores/${slug}/orders/${order.id}`)).data,
    enabled: awaitingShopperPayment,
    refetchInterval: awaitingShopperPayment ? 5000 : false,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (!liveOrder) return
    if (
      liveOrder.paidCents !== order.paidCents
      || liveOrder.totalCents !== order.totalCents
      || orderBalanceDueCents(liveOrder) !== balanceDue
    ) {
      onOrderChange(liveOrder)
      void queryClient.invalidateQueries({ queryKey: ordersKey(slug) })
    }
  }, [balanceDue, liveOrder, onOrderChange, order.paidCents, order.totalCents, queryClient, slug])

  const persistOrder = (updated: Order) => {
    onOrderChange(updated)
    void queryClient.invalidateQueries({ queryKey: ordersKey(slug) })
    void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
  }

  const addLine = useMutation({
    mutationFn: async ({ item, quantity }: { item: InventoryItem; quantity: number }) => {
      const { data } = await api.post<Order>(`/stores/${slug}/orders/${order.id}/lines`, {
        inventoryItemId: item.id,
        quantity,
      })
      return data
    },
    onSuccess: (updated) => {
      setLineError('')
      persistOrder(updated)
    },
    onError: (err) => setLineError(extractErrorMessage(err, 'Could not add that card.')),
  })

  const patchLine = useMutation({
    mutationFn: async ({ line, quantity }: { line: OrderLine; quantity: number }) => {
      setBusyLineId(line.id)
      if (quantity < 1) {
        const { data } = await api.delete<Order>(`/stores/${slug}/orders/${order.id}/lines/${line.id}`)
        return data
      }
      const { data } = await api.patch<Order>(`/stores/${slug}/orders/${order.id}/lines/${line.id}`, { quantity })
      return data
    },
    onSuccess: (updated) => {
      setLineError('')
      persistOrder(updated)
    },
    onError: (err) => setLineError(extractErrorMessage(err, 'Could not update that card.')),
    onSettled: () => setBusyLineId(null),
  })

  const settleCredit = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Order>(`/stores/${slug}/orders/${order.id}/payment-adjustment`)
      return data
    },
    onSuccess: (updated) => {
      setLineError('')
      persistOrder(updated)
    },
    onError: (err) => setLineError(extractErrorMessage(err, 'Could not refund this payment.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="font-mono text-lg tracking-tight sm:text-xl">{order.reference}</span>}
      className="max-w-3xl"
    >
      <div className="space-y-5 sm:space-y-6">
        <OrderStatusSelect
          order={order}
          pending={pendingStatus != null}
          onUpdateStatus={onUpdateStatus}
          size="md"
        />
        <OrderWorkflow status={order.status} />
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="rounded-xl border border-border bg-bg p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Customer</p>
            <p className="mt-2 text-base font-bold text-fg sm:text-lg">{order.customerName ?? 'Guest'}</p>
            <p className="mt-0.5 break-all text-sm text-fg-muted">{order.customerEmail ?? '—'}</p>
            {order.channel && (
              <p className="mt-3 text-xs text-fg-muted">
                Channel: <span className="font-semibold text-fg">{order.channel === 'kiosk' ? 'Kiosk' : 'Online'}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-border bg-bg p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Order total</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums text-fg sm:text-3xl">{formatPrice(order.totalCents)}</p>
            {(order.taxCents ?? 0) > 0 && (
              <p className="mt-1 text-sm text-fg-muted">Tax {formatPrice(order.taxCents ?? 0)} · paid {formatPrice(order.paidCents ?? 0)}</p>
            )}
            {creditOwed > 0 && capturedOnline && canEdit ? (
              <div className="mt-2 space-y-2">
                <p className="rounded-lg bg-success-50 px-3 py-2 text-sm font-semibold text-success-700">
                  {formatPrice(creditOwed)} to return after card changes
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={settleCredit.isPending}
                  onClick={() => settleCredit.mutate()}
                >
                  <Banknote aria-hidden className="size-4" />
                  Refund {formatPrice(creditOwed)} on {paypalOrder ? 'PayPal' : 'Square'}
                </Button>
              </div>
            ) : null}
            {balanceDue > 0 && canEdit && paypalOrder ? (
              <div className="mt-2 space-y-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-800">
                <p className="font-semibold">
                  Waiting for {formatPrice(balanceDue)} on PayPal
                </p>
                <p className="text-warning-900/90">
                  The shopper must approve this — we emailed them a secure PayPal link. Account holders can also pay from{' '}
                  <span className="font-semibold">Account → Orders</span>.
                </p>
                <p className="text-xs text-warning-900/80">
                  This screen updates automatically when they pay. Or collect {formatPrice(balanceDue)} at the counter.
                </p>
              </div>
            ) : balanceDue > 0 && canEdit ? (
              <p className="mt-2 rounded-lg bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700">
                Collect {formatPrice(balanceDue)} at the counter
              </p>
            ) : (order.status === 'refunded' || order.status === 'cancelled') && paypalOrder ? (
              <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-sm text-fg-muted">
                PayPal payment refunded. This order is closed and cannot be charged again.
              </p>
            ) : null}
            {(order.creditAppliedCents ?? 0) > 0 && (
              <p className="mt-2 text-xs text-fg-muted">
                Store credit applied: {formatPrice(order.creditAppliedCents ?? 0)}
              </p>
            )}
            {order.paymentCaptures && order.paymentCaptures.length > 0 ? (
              <div className="mt-3 space-y-1 rounded-lg bg-bg px-3 py-2 text-xs text-fg-muted">
                <p className="font-bold uppercase tracking-wide">Payment captures</p>
                {order.paymentCaptures.map((capture) => (
                  <p key={capture.id} className="font-mono break-all">
                    {capture.id}
                    <span className="text-fg">
                      {' '}
                      · {formatPrice(capture.amountCents)}
                      {capture.refundedCents > 0 ? ` (${formatPrice(capture.refundedCents)} refunded)` : ''}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
            {order.fulfillment && (
              <p className="mt-2 text-sm text-fg-muted">
                Fulfillment:{' '}
                <span className="font-semibold text-fg">Pickup</span>
              </p>
            )}
            {order.notes ? (
              <p className="mt-2 text-sm text-fg-muted">
                Note: <span className="font-semibold text-fg">{order.notes}</span>
              </p>
            ) : null}
            {order.disputeStatus ? (
              <div className="mt-3 space-y-2 rounded-xl border border-danger-500/30 bg-danger-50 p-3 text-sm text-danger-800">
                <p className="font-bold">
                  {order.paymentProvider === 'paypal' ? 'PayPal' : 'Square'} dispute ({order.disputeStatus}
                  {order.disputeReason ? ` · ${order.disputeReason}` : ''})
                </p>
                <p>
                  {order.paymentProvider === 'paypal'
                    ? 'Respond in PayPal Resolution Center with pickup proof. Do not restock unless you lose or choose to refund.'
                    : 'Respond in Square Dashboard with pickup proof. Do not restock unless you lose or choose to refund.'}{' '}
                  Runbook: <span className="font-semibold">deploy/CHARGEBACKS.md</span>
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Shopper name: {order.customerName || '—'}</li>
                  <li>Order time: {formatOrderDate(order.createdAt)}</li>
                  <li>
                    Pickup / staff notes: write evidence in{' '}
                    {order.paymentProvider === 'paypal' ? 'PayPal' : 'Square'} (name, time, who handed over the cards)
                  </li>
                  <li>Do not restock from this screen because of the dispute</li>
                </ul>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-fg-muted">{paymentSubtitle(order)}</p>
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Line items</p>
          <OrderLineList
            lines={order.lines ?? []}
            editing={canEdit}
            busyLineId={busyLineId}
            onQuantityChange={canEdit ? (line, quantity) => patchLine.mutate({ line, quantity }) : undefined}
            onRemove={canEdit ? (line) => patchLine.mutate({ line, quantity: 0 }) : undefined}
          />
          {canEdit ? (
            <div className="mt-4 space-y-2">
              <Input
                label="Add cards"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Search by card name or set…"
              />
              {addQuery.trim().length > 0 && addQuery.trim().length < ADD_CARD_SEARCH_MIN ? (
                <p className="text-xs text-fg-muted">Type at least {ADD_CARD_SEARCH_MIN} characters.</p>
              ) : null}
              <AnimatePresence mode="wait" initial={false}>
                {addSearching ? (
                  <motion.p
                    key="searching"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                    className="text-xs text-fg-muted"
                  >
                    Searching…
                  </motion.p>
                ) : addResults.length > 0 ? (
                  <motion.ul
                    key={`results-${addTerm.trim().toLowerCase()}`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                    className="max-h-64 space-y-1 overflow-y-auto"
                  >
                    {addResults.map((item, index) => (
                      <motion.li
                        key={item.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.14, ease: EASE_PREMIUM, delay: Math.min(index, 8) * 0.02 }}
                      >
                        <AddInventoryResultRow
                          item={item}
                          busy={addLine.isPending}
                          onAdd={(quantity) => addLine.mutate({ item, quantity })}
                        />
                      </motion.li>
                    ))}
                  </motion.ul>
                ) : addSearchReady ? (
                  <motion.p
                    key="empty"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                    className="text-xs text-fg-muted"
                  >
                    No in-stock matches.
                  </motion.p>
                ) : addQuery.trim().length === 0 ? (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                    className="text-xs text-fg-muted"
                  >
                    Search by name (e.g. Sol Ring), set a quantity, then add. You can keep adding from the same results.
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <p className="mt-3 text-xs text-fg-muted">Cards can be added or removed until the order is delivered, cancelled, or refunded.</p>
          )}
          {(lineError || addLine.isError || patchLine.isError) && (
            <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {lineError || extractErrorMessage(addLine.error ?? patchLine.error, 'Could not update this order.')}
            </p>
          )}
        </div>
        {actions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map(({ status, label, icon: Icon }) => (
              <Button
                key={status}
                variant={status === 'cancelled' || status === 'refunded' ? 'secondary' : 'primary'}
                onClick={() => onUpdateStatus(status)}
                loading={pendingStatus === status}
                className={actions.length === 1 ? 'sm:col-span-2' : undefined}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-bg px-4 py-3 text-sm text-fg-muted">This order is in a terminal status.</p>
        )}
        <Button
          variant="secondary"
          className="w-full"
          size="lg"
          onClick={() => {
            void printOrderSheet(order, slug).then((updated) => {
              if ((updated.taxCents ?? 0) !== (order.taxCents ?? 0)) persistOrder(updated)
            })
          }}
        >
          <Printer aria-hidden className="size-4" />
          Print order sheet
        </Button>
        {Boolean(error) && (
          <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
            Could not update this order. Please try again.
          </p>
        )}
      </div>
    </Modal>
  )
}

function AddInventoryResultRow({
  item,
  busy,
  onAdd,
}: {
  item: InventoryItem
  busy: boolean
  onAdd: (quantity: number) => void
}) {
  const maxQty = Math.max(1, item.quantity)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    setQty((current) => Math.min(Math.max(1, current), maxQty))
  }, [maxQty, item.id])

  return (
    <motion.div
      layout
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2 transition-colors hover:border-brand-300 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {cardImage(item.card) ? (
          <img src={cardImage(item.card)} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-fg">{item.card.name}</span>
          <span className="block text-xs text-fg-muted">
            {item.card.setCode?.toUpperCase()} · {item.condition}
            {item.isFoil ? ` · ${item.finish}` : ''} · {item.quantity} in stock
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold text-fg">{formatPrice(item.priceCents)}</span>
      </div>
      <div className="flex items-center justify-end gap-2 pl-[3.25rem] sm:pl-0">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg p-0.5">
          <motion.button
            type="button"
            aria-label={`Decrease quantity for ${item.card.name}`}
            disabled={busy || qty <= 1}
            whileTap={busy || qty <= 1 ? undefined : { scale: 0.9 }}
            onClick={() => setQty((current) => Math.max(1, current - 1))}
            className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-40"
          >
            <Minus className="size-3.5" aria-hidden />
          </motion.button>
          <span className="relative inline-grid min-w-6 place-items-center overflow-hidden text-center text-sm font-bold tabular-nums text-fg">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={qty}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                className="col-start-1 row-start-1"
              >
                {qty}
              </motion.span>
            </AnimatePresence>
          </span>
          <motion.button
            type="button"
            aria-label={`Increase quantity for ${item.card.name}`}
            disabled={busy || qty >= maxQty}
            whileTap={busy || qty >= maxQty ? undefined : { scale: 0.9 }}
            onClick={() => setQty((current) => Math.min(maxQty, current + 1))}
            className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-40"
          >
            <Plus className="size-3.5" aria-hidden />
          </motion.button>
        </div>
        <motion.div whileTap={busy || item.quantity < 1 ? undefined : { scale: 0.97 }}>
          <Button
            type="button"
            size="sm"
            disabled={busy || item.quantity < 1}
            onClick={() => onAdd(qty)}
          >
            Add
          </Button>
        </motion.div>
      </div>
    </motion.div>
  )
}

interface KioskLine {
  item: InventoryItem
  quantity: number
}

function KioskOrderModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 150)
  const [lines, setLines] = useState<KioskLine[]>([])
  const [kioskUserId, setKioskUserId] = useState('')
  const [created, setCreated] = useState<Order | null>(null)

  // Search server-side. Filtering in the browser meant downloading the store's
  // entire inventory (paged 500 rows at a time) before the first keystroke could
  // match anything.
  const term = debounced.trim()
  const searchReady = term.length >= ADD_CARD_SEARCH_MIN
  const { data: searchPage, isFetching: isLoading } = useInventoryPage(slug, {
    q: term,
    inStockOnly: true,
    itemsPerPage: 24,
    enabled: searchReady,
    keepPreviousData: false,
  })
  const results = searchReady ? rankInventorySearch(searchPage?.items ?? [], term) : []

  const totalCents = lines.reduce((sum, line) => sum + line.item.priceCents * line.quantity, 0)

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Order>(`/stores/${slug}/orders`, {
        channel: 'kiosk',
        fulfillment: 'pickup',
        ...(kioskUserId.trim() ? { kioskUserId: Number(kioskUserId.trim()) } : {}),
        inputLines: lines.map((line) => ({ inventoryItemId: line.item.id, quantity: line.quantity })),
      })
      return data
    },
    onSuccess: async (order) => {
      setCreated(order)
      setLines([])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ordersKey(slug) }),
        queryClient.invalidateQueries({ queryKey: inventoryKey(slug) }),
      ])
    },
  })

  function addLine(item: InventoryItem) {
    setCreated(null)
    setLines((current) => {
      const existing = current.find((line) => line.item.id === item.id)
      if (existing) {
        return current.map((line) =>
          line.item.id === item.id ? { ...line, quantity: Math.min(line.quantity + 1, item.quantity) } : line,
        )
      }
      return [...current, { item, quantity: 1 }]
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New kiosk order"
      className="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            Close
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => create.mutate()} loading={create.isPending} disabled={lines.length === 0}>
            <Monitor className="size-4" aria-hidden />
            Create order · {formatPrice(totalCents)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <Input label="Search inventory" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card name…" autoFocus />
          <Input
            label="Customer user ID (optional)"
            value={kioskUserId}
            onChange={(e) => setKioskUserId(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="e.g. 42"
          />
        </div>

        {isLoading ? (
          <LoadingPanel />
        ) : results.length > 0 ? (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => addLine(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-brand-300"
                >
                  {cardImage(item.card) && (
                    <img src={cardImage(item.card)} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-fg">{item.card.name}</span>
                    <span className="block text-xs text-fg-muted">
                      {item.card.setCode?.toUpperCase()} · {item.condition}
                      {item.isFoil ? ` · ${item.finish}` : ''} · {item.quantity} in stock
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-fg">{formatPrice(item.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim().length > 0 && query.trim().length < ADD_CARD_SEARCH_MIN ? (
          <p className="text-xs text-fg-muted">Type at least {ADD_CARD_SEARCH_MIN} characters.</p>
        ) : searchReady ? (
          <EmptyState icon={Search} title="No in-stock matches" description="Try a different name." />
        ) : null}

        {lines.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            {lines.map((line) => (
              <div key={line.item.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold text-fg">{line.item.card.name}</span>
                <input
                  type="number"
                  min={1}
                  max={line.item.quantity}
                  value={line.quantity}
                  onChange={(e) => {
                    const next = Math.max(1, Math.min(Number(e.target.value) || 1, line.item.quantity))
                    setLines((current) => current.map((l) => (l.item.id === line.item.id ? { ...l, quantity: next } : l)))
                  }}
                  aria-label={`Quantity of ${line.item.card.name}`}
                  className="w-16 rounded-lg border border-border bg-surface px-2 py-1"
                />
                <span className="w-20 text-right font-bold">{formatPrice(line.item.priceCents * line.quantity)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${line.item.card.name}`}
                  onClick={() => setLines((current) => current.filter((l) => l.item.id !== line.item.id))}
                  className="rounded-full p-1 text-fg-muted hover:bg-bg hover:text-danger-700"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}

        {create.isError && (
          <p className="text-sm font-medium text-danger-700" role="alert">
            {extractErrorMessage(create.error, 'Could not create the kiosk order.')}
          </p>
        )}
        {created && (
          <p className="rounded-xl bg-success-50 px-3 py-2 text-sm font-medium text-success-700" role="status">
            Created {created.reference} · {formatPrice(created.totalCents)}.
          </p>
        )}
      </div>
    </Modal>
  )
}
