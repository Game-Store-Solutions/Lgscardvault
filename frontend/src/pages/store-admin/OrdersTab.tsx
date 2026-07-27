import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, PackageCheck, Printer, ReceiptText, RotateCcw, XCircle, type LucideIcon } from 'lucide-react'
import api, { formatPrice, httpStatus } from '../../api/client'
import type { Order, OrderStatus } from '../../api/types'
import { ordersKey, useOrders } from '../../hooks'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingPanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'
import { cx } from '../../lib/cx'
import { OrderLineList } from '../../components/orders/OrderLineList'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { OrderWorkflow } from '../../components/orders/OrderWorkflow'
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS, formatOrderDate, orderItemCount } from '../../lib/orders'

function statusActions(status: OrderStatus): { status: OrderStatus; label: string; icon: typeof CheckCircle2 }[] {
  if (status === 'pending') {
    return [
      { status: 'received', label: 'Mark received', icon: CheckCircle2 },
      { status: 'cancelled', label: 'Cancel', icon: XCircle },
    ]
  }
  if (status === 'received' || status === 'paid' || status === 'shipped') {
    return [
      { status: 'fulfilled', label: 'Mark fulfilled', icon: PackageCheck },
      { status: 'refunded', label: 'Refund', icon: RotateCcw },
    ]
  }
  return []
}

export default function OrdersTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data = [], isLoading, error, refetch } = useOrders(slug)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

  const selected = data.find((order) => order.id === selectedId) ?? data[0] ?? null
  const filtered = useMemo(
    () => (statusFilter === 'all' ? data : data.filter((order) => order.status === statusFilter)),
    [data, statusFilter],
  )
  const metrics = useMemo(() => {
    const open = data.filter((order) => order.status === 'pending' || order.status === 'received' || order.status === 'paid' || order.status === 'shipped')
    const fulfilled = data.filter((order) => order.status === 'fulfilled' || order.status === 'completed')
    const totalCents = data.reduce((sum, order) => sum + order.totalCents, 0)

    return {
      open: open.length,
      pending: data.filter((order) => order.status === 'pending').length,
      fulfilled: fulfilled.length,
      totalCents,
    }
  }, [data])

  useEffect(() => {
    if (selectedId === null && data.length > 0) setSelectedId(data[0].id)
  }, [data, selectedId])

  const updateStatus = useMutation({
    mutationFn: async ({ order, status }: { order: Order; status: OrderStatus }) => {
      const { data: updated } = await api.patch<Order>(`/stores/${slug}/orders/${order.id}`, { status })
      return updated
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Order[]>(ordersKey(slug), (current = []) =>
        current.map((order) => (order.id === updated.id ? updated : order)),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ordersKey(slug) }),
  })

  const status = httpStatus(error)
  const endpointMissing = status === 404 || status === 405

  if (isLoading) return <LoadingPanel label="Loading orders..." />

  if (endpointMissing) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={ReceiptText}
            title="Orders backend not available yet"
            description={
              <>
                This page expects a <code className="text-fg">GET /api/stores/{slug}/orders</code> endpoint.
              </>
            }
          />
        </CardBody>
      </Card>
    )
  }

  if (error) return <ErrorState title="Failed to load orders" description="Please try again." onRetry={() => void refetch()} />

  if (data.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={ReceiptText} title="No orders yet" description="Customer orders will appear here." />
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OrderMetric icon={Clock3} label="Needs action" value={String(metrics.open)} />
        <OrderMetric icon={ReceiptText} label="Pending" value={String(metrics.pending)} />
        <OrderMetric icon={PackageCheck} label="Fulfilled" value={String(metrics.fulfilled)} />
        <OrderMetric icon={CheckCircle2} label="Order value" value={formatPrice(metrics.totalCents)} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <Card>
        <CardHeader
          title="Past orders"
          subtitle={`${data.length} ${data.length === 1 ? 'order' : 'orders'} for this store.`}
          actions={
            <select
              aria-label="Filter orders by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as OrderStatus | 'all')}
              className="h-9 rounded-btn border border-border bg-surface px-3 text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="all">All statuses</option>
              {ACTIVE_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          }
        />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Reference</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH>Total</TH>
                <TH>Placed</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((order) => (
                <TR
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  className={cx('cursor-pointer', selected?.id === order.id && 'bg-brand-50/70 hover:bg-brand-50')}
                >
                  <TD className="font-mono text-xs font-bold">{order.reference}</TD>
                  <TD>
                    <div className="max-w-48">
                      <p className="truncate font-medium">{order.customerName ?? '-'}</p>
                      {order.customerEmail && <p className="truncate text-xs text-fg-muted">{order.customerEmail}</p>}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <OrderStatusBadge status={order.status} />
                      {order.fulfillment === 'pickup' && <Badge tone="neutral">Pickup</Badge>}
                      {order.fulfillment === 'shipping' && <Badge tone="neutral">Ship</Badge>}
                    </div>
                  </TD>
                  <TD className="font-bold">{formatPrice(order.totalCents)}</TD>
                  <TD className="text-fg-muted">{formatOrderDate(order.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {filtered.length === 0 && (
            <p className="border-t border-border px-4 py-8 text-center text-sm text-fg-muted">
              No orders match this status.
            </p>
          )}
        </CardBody>
        </Card>

        <OrderDetails
          order={selected}
          pendingStatus={updateStatus.variables?.order.id === selected?.id ? updateStatus.variables.status : null}
          error={updateStatus.error}
          onUpdateStatus={(status) => selected && updateStatus.mutate({ order: selected, status })}
        />
      </div>
    </div>
  )
}

function OrderDetails({
  order,
  pendingStatus,
  error,
  onUpdateStatus,
}: {
  order: Order | null
  pendingStatus: OrderStatus | null
  error: unknown
  onUpdateStatus: (status: OrderStatus) => void
}) {
  if (!order) return null

  const actions = statusActions(order.status)

  return (
    <Card className="xl:sticky xl:top-20">
      <CardHeader
        title={order.reference}
        subtitle={`${orderItemCount(order)} ${orderItemCount(order) === 1 ? 'item' : 'items'} · ${formatOrderDate(order.createdAt)}`}
        actions={<OrderStatusBadge status={order.status} />}
      />
      <CardBody className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-muted">Workflow</p>
          <OrderWorkflow status={order.status} />
        </div>

        <div className="rounded-card border border-border bg-bg px-3 py-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-muted">Customer</p>
          <div>
            <p className="text-sm font-bold text-fg">{order.customerName ?? 'Customer'}</p>
            <p className="text-sm text-fg-muted">{order.customerEmail ?? '-'}</p>
          </div>
          {order.fulfillment && (
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-fg-muted">
              {order.fulfillment === 'pickup' ? 'In-store pickup' : 'Ship to customer'}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-muted">Items</p>
          <OrderLineList lines={order.lines ?? []} compact />
        </div>

        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <span className="font-bold text-fg">Order total</span>
          <span className="font-display text-3xl font-extrabold text-fg">{formatPrice(order.totalCents)}</span>
        </div>

        {actions.length > 0 ? (
          <div className="grid gap-2">
            {actions.map(({ status, label, icon: Icon }) => (
              <Button
                key={status}
                variant={status === 'cancelled' || status === 'refunded' ? 'secondary' : 'primary'}
                onClick={() => onUpdateStatus(status)}
                loading={pendingStatus === status}
                className="w-full"
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="rounded-btn border border-border bg-bg px-3 py-2 text-sm text-fg-muted">
            This order is in a terminal status.
          </p>
        )}

        <Button variant="secondary" className="w-full" onClick={() => printOrderSheet(order)}>
          <Printer aria-hidden className="size-4" />
          Print order sheet
        </Button>

        {Boolean(error) && (
          <p role="alert" className="rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            Could not update this order. Please try again.
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function printOrderSheet(order: Order) {
  const preTaxTotalCents = order.totalCents
  const taxCents = 0
  const postTaxTotalCents = preTaxTotalCents + taxCents
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', `Print ${order.reference}`)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'

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
      // Case cards get an unmissable label telling staff exactly which
      // physical case + section to pull from (vs. regular binder/box stock).
      const caseQuantity = line.caseQuantity ?? 0
      const caseBadge =
        caseQuantity > 0
          ? `<div class="case-badge">CASE CARD — ${escapeHtml(line.caseName ?? 'Case')} / ${escapeHtml(line.sectionTitle ?? 'Section')}${
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
          .tax-note { color: #6b7280; font-size: 12px; margin-top: 8px; text-align: right; }
          .case-badge { background: #111827; border-radius: 4px; color: #ffffff; display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .05em; margin-top: 4px; padding: 2px 6px; text-transform: uppercase; }
          @media print { body { margin: 18mm; } button { display: none; } }
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
          <div class="total-row">
            <span>Pre-tax total</span>
            <strong>${formatPrice(preTaxTotalCents)}</strong>
          </div>
          <div class="total-row">
            <span>Tax</span>
            <strong>${formatPrice(taxCents)}</strong>
          </div>
          <div class="total-row final">
            <span>Post-tax total</span>
            <strong>${formatPrice(postTaxTotalCents)}</strong>
          </div>
          <div class="tax-note">Tax is not calculated yet, so post-tax total currently matches pre-tax total.</div>
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

function OrderMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-700">
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</p>
          <p className="truncate font-display text-2xl font-extrabold text-fg">{value}</p>
        </div>
      </CardBody>
    </Card>
  )
}
