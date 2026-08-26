import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  EllipsisVertical,
  Monitor,
  Package,
  PackageCheck,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, httpStatus } from '../../api/client'
import type { InventoryItem, Order, OrderChannel, OrderStatus } from '../../api/types'
import { inventoryKey, openStoreOrdersCountKey, ordersKey, resolveOrdersListTotal, useDebouncedValue, useInventoryPage, useOrders, useStoreOrderQueueCounts } from '../../hooks'
import { Avatar, Button, EmptyState, ErrorState, Input, LoadingPanel, Modal, Select } from '../../components/ui'
import { OrderLineList } from '../../components/orders/OrderLineList'
import { OrderWorkflow } from '../../components/orders/OrderWorkflow'
import { cx } from '../../lib/cx'
import {
  ORDER_LIST_TABS,
  countOrdersBetween,
  customerTierLabel,
  freshStatusPresentation,
  orderPrimaryProductName,
  paymentSubtitle,
  percentChange,
  type OrderListTab,
} from '../../lib/orderManagementUi'
import { ORDER_STATUS_LABELS, formatOrderDate, formatOrderShortDate, orderItemCount, orderLineImage } from '../../lib/orders'

const PAGE_SIZE = 8
/** Keeps pagination from jumping when the last page has fewer rows. */
const ORDER_TABLE_ROW_H = 'h-[4.75rem]'

function tabQueueCount(
  tabId: OrderListTab,
  counts: { pending: number; processing: number; delivery: number; ready: number; delivered: number } | undefined,
): number {
  if (!counts) return 0
  switch (tabId) {
    case 'pending':
      return counts.pending
    case 'processing':
      return counts.processing
    case 'delivery':
      return counts.delivery
    case 'ready':
      return counts.ready
    case 'delivered':
      return counts.delivered
    default:
      return 0
  }
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

export default function OrdersTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<OrderListTab>('all')
  const {
    data: pageData,
    isPending,
    isFetching,
    error,
    refetch: refetchOrders,
  } = useOrders(slug, page, PAGE_SIZE, tab)
  const { data: queueCounts, refetch: refetchQueueCounts } = useStoreOrderQueueCounts(slug)
  const data = pageData?.items ?? []
  const orderTotal = pageData?.total ?? 0
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [channelFilter, setChannelFilter] = useState<OrderChannel | 'all'>('all')
  const [kioskOpen, setKioskOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [menuOrderId, setMenuOrderId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => setPage(1), [tab, channelFilter, debouncedSearch])

  const selectTab = (next: OrderListTab) => {
    // Only force a network round-trip when the same tab is clicked again (an
    // explicit "reload this list"). Switching tabs used to invalidate every
    // cached orders query for the store, refetching each previously visited
    // tab and page in parallel just to show one of them.
    if (next === tab) {
      refreshOrdersAndCounts()
      return
    }
    setTab(next)
  }

  const refreshOrdersAndCounts = () => {
    void queryClient.invalidateQueries({ queryKey: ordersKey(slug) })
    void refetchQueueCounts()
    void refetchOrders()
  }

  const listTotal = resolveOrdersListTotal(tab, orderTotal, queueCounts)
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE))
  const pageOrders = filtered

  const stats = useMemo(() => {
    const now = Date.now()
    const day = 86400000
    const last7 = countOrdersBetween(data, now - 7 * day, now)
    const prev7 = countOrdersBetween(data, now - 14 * day, now - 7 * day)
    return {
      newOrders: tab === 'all' ? (queueCounts?.total ?? orderTotal) : orderTotal,
      newTrend: percentChange(last7, prev7),
      pending: queueCounts?.pending ?? data.filter((o) => o.status === 'pending').length,
      completed: data.filter((o) => o.status === 'completed').length,
      canceled: data.filter((o) => o.status === 'cancelled' || o.status === 'refunded').length,
    }
  }, [data, orderTotal, queueCounts?.pending, queueCounts?.total, tab])

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

  const status = httpStatus(error)
  const endpointMissing = status === 404 || status === 405

  if (isPending && data.length === 0 && !error) {
    return (
      <div className="rounded-2xl bg-bg px-4 py-16">
        <LoadingPanel label="Loading orders…" />
      </div>
    )
  }

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
    <div className="-mt-4 w-full min-w-0 space-y-6 pb-10 pt-2">
      <header data-guide="Order Management">
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Order Management</h1>
        <p className="mt-1 text-sm text-fg-muted">Track and manage all store orders in real time.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          iconClass="bg-brand-50 text-brand-600"
          label="Total New Orders"
          value={String(stats.newOrders)}
          trend={stats.newTrend}
        />
        <StatCard
          icon={Package}
          iconClass="bg-warning-50 text-warning-700"
          label="Total Orders Pending"
          value={String(stats.pending)}
          trend={stats.pending > 0 ? -10 : null}
          trendNegative
        />
        <StatCard
          icon={CheckCircle2}
          iconClass="bg-success-50 text-success-700"
          label="Total Orders Completed"
          value={String(stats.completed)}
          trend={stats.completed > 0 ? 54 : null}
        />
        <StatCard
          icon={XCircle}
          iconClass="bg-danger-50 text-danger-700"
          label="Total Orders Canceled"
          value={String(stats.canceled)}
          trend={stats.canceled > 0 ? 54 : null}
        />
      </div>

      <section className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-fg" data-guide="Orders List">Orders List</h2>
          <Button size="sm" onClick={() => setKioskOpen(true)}>
            <Plus aria-hidden className="size-4" />
            Add Order
          </Button>
        </div>

        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {ORDER_LIST_TABS.map((item) => {
              const count = tabQueueCount(item.id, queueCounts)
              const active = tab === item.id
              return (
              <button
                key={item.id}
                type="button"
                data-guide={`${item.label} tab`}
                onClick={() => selectTab(item.id)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                  active ? 'bg-brand-500 text-white shadow-sm' : 'text-fg-muted hover:bg-bg',
                )}
              >
                <span>{item.label}</span>
                {item.id !== 'delivered' && count > 0 ? (
                  <span
                    className={cx(
                      'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-none',
                      active ? 'bg-white/25 text-white' : 'bg-brand-700 text-brand-100',
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
              </button>
            )})}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xl">
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
              aria-label="Filter by channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as OrderChannel | 'all')}
              wrapperClassName="w-[9.5rem] shrink-0"
              className="h-10"
            >
              <option value="all">All channels</option>
              <option value="online">Online</option>
              <option value="kiosk">Kiosk</option>
            </Select>
            <button
              type="button"
              aria-label="Filter options"
              className="grid size-10 place-items-center rounded-xl border border-border text-fg-muted hover:bg-bg"
            >
              <SlidersHorizontal aria-hidden className="size-4" />
            </button>
          </div>
        </div>

        {orderTotal === 0 ? (
          <div className="px-5 py-16">
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
        ) : filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-fg-muted">No orders match this filter.</p>
        ) : (
          <>
            <div className="relative min-w-0">
              {isFetching ? (
                <p
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-border/60 bg-surface/90 px-5 py-2 text-xs font-medium text-fg-muted backdrop-blur-[2px]"
                  role="status"
                >
                  Updating list…
                </p>
              ) : null}
              <table className="w-full table-fixed text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="w-[28%] px-5 py-3 font-semibold">Product Name</th>
                    <th className="w-[20%] px-5 py-3 font-semibold">Customer Name</th>
                    <th className="w-[14%] px-5 py-3 font-semibold">Order Id</th>
                    <th className="w-[12%] px-5 py-3 font-semibold">Amount</th>
                    <th className="w-[12%] px-5 py-3 font-semibold">Status</th>
                    <th className="w-16 px-3 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody
                  className={cx('min-h-0 transition-opacity duration-150', isFetching && 'opacity-70')}
                >
                  {pageOrders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        menuOpen={menuOrderId === order.id}
                        menuRef={menuOrderId === order.id ? menuRef : undefined}
                        onToggleMenu={() => setMenuOrderId((id) => (id === order.id ? null : order.id))}
                        onOpenDetail={() => {
                          setDetailOrder(order)
                          setMenuOrderId(null)
                        }}
                        onPrint={() => printOrderSheet(order)}
                        onUpdateStatus={(s) => updateStatus.mutate({ order, status: s })}
                        updatePending={updateStatus.isPending && updateStatus.variables?.order.id === order.id}
                      />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </section>

      {kioskOpen && <KioskOrderModal slug={slug} onClose={() => setKioskOpen(false)} />}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          pendingStatus={updateStatus.variables?.order.id === detailOrder.id ? updateStatus.variables.status : null}
          error={updateStatus.error}
          onClose={() => setDetailOrder(null)}
          onUpdateStatus={(status) => updateStatus.mutate({ order: detailOrder, status })}
        />
      )}
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
    <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className={cx('grid size-12 shrink-0 place-items-center rounded-2xl', iconClass)}>
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg-muted" data-guide={label}>
          {label}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="font-display text-2xl font-bold text-fg">{value}</p>
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

function OrderRow({
  order,
  menuOpen,
  menuRef,
  onToggleMenu,
  onOpenDetail,
  onPrint,
  onUpdateStatus,
  updatePending,
}: {
  order: Order
  menuOpen: boolean
  menuRef?: React.RefObject<HTMLDivElement | null>
  onToggleMenu: () => void
  onOpenDetail: () => void
  onPrint: () => void
  onUpdateStatus: (status: OrderStatus) => void
  updatePending: boolean
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstLine = order.lines?.[0]
  const thumb = firstLine ? orderLineImage(firstLine) : undefined
  const statusUi = freshStatusPresentation(order.status)
  const actions = statusActions(order.status)
  const itemCount = orderItemCount(order)

  return (
    <tr className={cx('border-b border-border/60 transition-colors hover:bg-bg/80', ORDER_TABLE_ROW_H)}>
      <td className="px-5 py-4 align-middle">
        <button type="button" onClick={onOpenDetail} className="flex items-center gap-3 text-left">
          <span className="grid size-11 shrink-0 overflow-hidden rounded-xl bg-bg">
            {thumb ? (
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-fg-muted">
                <Package aria-hidden className="size-5" />
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fg">{orderPrimaryProductName(order)}</span>
            <span className="block text-xs text-fg-muted">Items {itemCount}</span>
          </span>
        </button>
      </td>
      <td className="px-5 py-4 align-middle">
        <div className="flex items-center gap-3">
          <Avatar name={order.customerName ?? 'Guest'} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{order.customerName ?? 'Guest'}</p>
            <p className="text-xs text-fg-muted">{customerTierLabel(order)}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 align-middle">
        <p className="font-semibold text-fg">{order.reference}</p>
        <p className="text-xs text-fg-muted">{formatOrderShortDate(order.createdAt)}</p>
      </td>
      <td className="px-5 py-4 align-middle">
        <p className="font-bold text-fg">{formatPrice(order.totalCents)}</p>
        <p className="text-xs text-fg-muted">{paymentSubtitle(order)}</p>
      </td>
      <td className="px-5 py-4 align-middle">
        <span className={cx('inline-flex rounded-lg px-2.5 py-1 text-xs font-bold', statusUi.className)}>{statusUi.label}</span>
        {order.disputeStatus && (
          <p className="mt-1 text-xs font-bold text-danger-700">Dispute · {order.disputeReason || order.disputeStatus}</p>
        )}
      </td>
      <td className="px-3 py-4 align-middle text-right">
        <button
          ref={triggerRef}
          type="button"
          data-guide="Order actions"
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
          data-guide={label}
          data-training-mutation
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
    <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted disabled:opacity-40 hover:bg-bg"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Previous
      </button>
      <div className="flex items-center gap-1">
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
        Next
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </div>
  )
}

function OrderDetailModal({
  order,
  pendingStatus,
  error,
  onClose,
  onUpdateStatus,
}: {
  order: Order
  pendingStatus: OrderStatus | null
  error: unknown
  onClose: () => void
  onUpdateStatus: (status: OrderStatus) => void
}) {
  const actions = statusActions(order.status)
  const statusUi = freshStatusPresentation(order.status)

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="font-mono text-xl tracking-tight">{order.reference}</span>}
      className="max-w-3xl"
    >
      <div className="space-y-6">
        <span className={cx('inline-flex rounded-lg px-3 py-1.5 text-sm font-bold', statusUi.className)}>{statusUi.label}</span>
        <OrderWorkflow status={order.status} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Customer</p>
            <p className="mt-2 text-lg font-bold text-fg">{order.customerName ?? 'Guest'}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{order.customerEmail ?? '—'}</p>
            {order.channel && (
              <p className="mt-3 text-xs text-fg-muted">
                Channel: <span className="font-semibold text-fg">{order.channel === 'kiosk' ? 'Kiosk' : 'Online'}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-border bg-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Order total</p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums text-fg">{formatPrice(order.totalCents)}</p>
            {(order.taxCents ?? 0) > 0 && (
              <p className="mt-1 text-sm text-fg-muted">Tax {formatPrice(order.taxCents ?? 0)} · paid {formatPrice(order.paidCents ?? 0)}</p>
            )}
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
                  Square dispute ({order.disputeStatus}
                  {order.disputeReason ? ` · ${order.disputeReason}` : ''})
                </p>
                <p>
                  Respond in Square Dashboard with pickup proof. Do not restock unless you lose or choose to
                  refund. Runbook: <span className="font-semibold">deploy/CHARGEBACKS.md</span>
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Shopper name: {order.customerName || '—'}</li>
                  <li>Order time: {formatOrderDate(order.createdAt)}</li>
                  <li>Pickup / staff notes: write evidence in Square (name, time, who handed over the cards)</li>
                  <li>Do not restock from this screen because of the dispute</li>
                </ul>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-fg-muted">{paymentSubtitle(order)}</p>
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Line items</p>
          <OrderLineList lines={order.lines ?? []} />
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
        <Button variant="secondary" className="w-full" size="lg" onClick={() => printOrderSheet(order)}>
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

interface KioskLine {
  item: InventoryItem
  quantity: number
}

function KioskOrderModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 200)
  const [lines, setLines] = useState<KioskLine[]>([])
  const [kioskUserId, setKioskUserId] = useState('')
  const [created, setCreated] = useState<Order | null>(null)

  // Search server-side. Filtering in the browser meant downloading the store's
  // entire inventory (paged 500 rows at a time) before the first keystroke could
  // match anything.
  const term = debounced.trim()
  const { data: searchPage, isFetching: isLoading } = useInventoryPage(slug, {
    q: term,
    inStockOnly: true,
    itemsPerPage: 12,
    enabled: term !== '',
  })
  const results = term === '' ? [] : (searchPage?.items ?? [])

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
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={lines.length === 0}>
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
        ) : query.trim() ? (
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

function printOrderSheet(order: Order) {
  const preTaxTotalCents = order.totalCents
  const taxCents = order.taxCents ?? 0
  const postTaxTotalCents = preTaxTotalCents + taxCents
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', `Print ${order.reference}`)
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'

  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    return
  }

  frameWindow.addEventListener('afterprint', () => iframe.remove(), { once: true })
  const rows = (order.lines ?? [])
    .map((line) => {
      const setCode = line.setCode ? line.setCode.toUpperCase() : '-'
      const collectorNumber = line.collectorNumber ?? '-'
      const lineTotal = formatPrice(line.quantity * line.priceCents)
      const caseQuantity = line.caseQuantity ?? 0
      const caseBadge =
        caseQuantity > 0
          ? `<div class="case-badge">CASE CARD. ${escapeHtml(line.caseName ?? 'Case')} / ${escapeHtml(line.sectionTitle ?? 'Section')}${
              caseQuantity < line.quantity ? ` · pull ${caseQuantity} of ${line.quantity} from case` : ''
            }</div>`
          : ''
      return `
        <tr>
          <td>${escapeHtml(line.cardName)}${caseBadge}</td>
          <td>${escapeHtml(setCode)}</td>
          <td>${escapeHtml(collectorNumber)}</td>
          <td>${line.quantity}</td>
          <td>${formatPrice(line.priceCents)}</td>
          <td>${lineTotal}</td>
        </tr>
      `
    })
    .join('')

  frameDocument.open()
  frameDocument.write(`
    <!doctype html>
    <html>
      <head>
        <title>Order ${escapeHtml(order.reference)}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          header { border-bottom: 2px solid #111827; margin-bottom: 24px; padding-bottom: 16px; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          .muted { color: #4b5563; }
          .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-bottom: 24px; }
          .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
          .label { color: #6b7280; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
          .value { font-size: 14px; font-weight: 700; margin-top: 4px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }
          th { color: #4b5563; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
          td:nth-child(4), td:nth-child(5), td:nth-child(6), th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
          .totals { margin-left: auto; margin-top: 20px; width: 320px; }
          .total-row { align-items: baseline; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; padding: 8px 0; }
          .total-row.final { border-bottom: 0; font-weight: 700; }
          .total-row.final strong { font-size: 24px; }
          .case-badge { background: #111827; border-radius: 4px; color: #ffffff; display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .05em; margin-top: 4px; padding: 2px 6px; text-transform: uppercase; }
          @media print { body { margin: 18mm; } }
        </style>
      </head>
      <body>
        <header>
          <h1>Order Sheet</h1>
          <div class="muted">${escapeHtml(order.reference)} · ${escapeHtml(formatOrderDate(order.createdAt))}</div>
        </header>
        <section class="grid">
          <div class="box">
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(order.customerName ?? 'Customer')}</div>
            <div class="muted">${escapeHtml(order.customerEmail ?? '-')}</div>
          </div>
          <div class="box">
            <div class="label">Status</div>
            <div class="value">${escapeHtml(ORDER_STATUS_LABELS[order.status])}</div>
            <div class="muted">${orderItemCount(order)} ${orderItemCount(order) === 1 ? 'item' : 'items'}</div>
          </div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Set</th>
              <th>Collector #</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="total-row"><span>Pre-tax total</span><strong>${formatPrice(preTaxTotalCents)}</strong></div>
          <div class="total-row"><span>Tax</span><strong>${formatPrice(taxCents)}</strong></div>
          <div class="total-row final"><span>Post-tax total</span><strong>${formatPrice(postTaxTotalCents)}</strong></div>
        </div>
      </body>
    </html>
  `)
  frameDocument.close()

  window.setTimeout(() => {
    frameWindow.focus()
    frameWindow.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}
