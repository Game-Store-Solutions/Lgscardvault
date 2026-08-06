import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarRange, LineChart as LineChartIcon, TrendingUp } from 'lucide-react'
import { formatPrice, httpStatus } from '../../api/client'
import { useOrders } from '../../hooks'
import { formatDate } from '../../lib/format'
import {
  bucketRevenueByDay,
  computeReportMetrics,
  filterOrdersByRange,
  ordersByChannel,
  readShowProfitMetrics,
  resolveDateRange,
  topCardsByRevenue,
  writeShowProfitMetrics,
  type DateRangePreset,
} from '../../lib/reports'
import { RevenueOverTimeChart, DonutChart, HorizontalBarList, StatusBarChart, type RevenueChartType } from '../../components/reports/ReportCharts'
import { cx } from '../../lib/cx'
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyRow,
  Badge,
  LoadingPanel,
  EmptyState,
  ErrorState,
  Input,
  Button,
} from '../../components/ui'

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-fg">{value}</p>
        {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
      </CardBody>
    </Card>
  )
}


export default function ReportsTab({ slug }: { slug: string }) {
  const { data: orders = [], isLoading, error } = useOrders(slug)
  const [preset, setPreset] = useState<DateRangePreset>('90d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [revenueChartType, setRevenueChartType] = useState<RevenueChartType>('bar')
  const [showProfitMetrics, setShowProfitMetrics] = useState(() => readShowProfitMetrics(slug))

  function toggleProfitMetrics(enabled: boolean) {
    setShowProfitMetrics(enabled)
    writeShowProfitMetrics(slug, enabled)
  }

  useEffect(() => {
    setShowProfitMetrics(readShowProfitMetrics(slug))
  }, [slug])

  const range = useMemo(
    () => resolveDateRange(preset, customFrom || undefined, customTo || undefined),
    [preset, customFrom, customTo],
  )

  const filteredOrders = useMemo(() => filterOrdersByRange(orders, range), [orders, range])

  const report = useMemo(() => computeReportMetrics(filteredOrders), [filteredOrders])

  const dailyBuckets = useMemo(() => {
    const buckets = bucketRevenueByDay(filteredOrders, range)
    if (buckets.length <= 31) {
      return buckets.map((b) => ({
        label: b.label,
        value: b.revenueCents,
        secondary: b.orderCount ? `${b.orderCount} order${b.orderCount === 1 ? '' : 's'}` : undefined,
      }))
    }
    const chunkSize = Math.ceil(buckets.length / 24)
    const chunked: { label: string; value: number; secondary?: string }[] = []
    for (let i = 0; i < buckets.length; i += chunkSize) {
      const slice = buckets.slice(i, i + chunkSize)
      const revenue = slice.reduce((s, b) => s + b.revenueCents, 0)
      const orders = slice.reduce((s, b) => s + b.orderCount, 0)
      chunked.push({
        label: slice.length === 1 ? slice[0].label : `${slice[0].label} – ${slice[slice.length - 1].label}`,
        value: revenue,
        secondary: orders ? `${orders} orders` : undefined,
      })
    }
    return chunked
  }, [filteredOrders, range])

  const topCards = useMemo(() => topCardsByRevenue(filteredOrders), [filteredOrders])

  const channelBreakdown = useMemo(() => ordersByChannel(filteredOrders), [filteredOrders])

  const statusChartRows = useMemo(
    () =>
      report.statusRows.map(([status, row]) => ({
        status,
        count: row.count,
        totalCents: row.totalCents,
      })),
    [report.statusRows],
  )

  const rangeLabel = `${formatDate(range.from.toISOString())} – ${formatDate(range.to.toISOString())}`

  const status = httpStatus(error)
  const endpointMissing = status === 404 || status === 405

  if (isLoading) {
    return <LoadingPanel label="Loading reports…" />
  }

  if (endpointMissing) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={TrendingUp}
            title="Reports need the orders endpoint"
            description={
              <>
                Revenue is calculated from <code className="text-fg">GET /api/stores/{slug}/orders</code>.
              </>
            }
          />
        </CardBody>
      </Card>
    )
  }

  if (error) {
    return <ErrorState title="Failed to load reports" description="Please try again." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-fg">Sales reports</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Revenue includes paid, shipped, completed, and fulfilled orders in the selected range.
            {showProfitMetrics && ' Profit metrics use acquisition cost snapshotted on each order line.'}
          </p>
        </div>
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <CalendarRange aria-hidden className="size-4 shrink-0" />
          <span>{rangeLabel}</span>
        </p>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPreset(item.id)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                  preset === item.id
                    ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                    : 'border-border bg-surface text-fg-muted hover:border-brand-400 hover:text-fg',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
              <Input
                label="From"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <Input
                label="To"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
          <p className="text-xs text-fg-muted">
            Showing {report.orderCount} order{report.orderCount === 1 ? '' : 's'} in range
            {orders.length > report.orderCount ? ` (${orders.length} total loaded)` : ''}.
          </p>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-bg/50 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-border text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
              checked={showProfitMetrics}
              onChange={(e) => toggleProfitMetrics(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-fg">Show profit &amp; COGS</span>
              <span className="mt-0.5 block text-xs text-fg-muted">
                Requires &ldquo;your cost&rdquo; on listings; uses the cost recorded when each order was placed.
              </span>
            </span>
          </label>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Revenue" value={formatPrice(report.revenueCents)} />
        <MetricCard label="Revenue orders" value={report.revenueOrders.length} />
        <MetricCard label="Average order" value={formatPrice(report.averageOrderCents)} />
        <MetricCard label="Pending value" value={formatPrice(report.pendingCents)} />
      </div>

      {showProfitMetrics ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg">Profit metrics</p>
            <Button variant="ghost" size="sm" type="button" onClick={() => toggleProfitMetrics(false)}>
              Hide
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Cost of goods sold" value={formatPrice(report.cogsCents)} />
            <MetricCard label="Gross profit" value={formatPrice(report.grossProfitCents)} />
            <MetricCard
              label="Gross margin"
              value={report.marginPercent != null ? `${report.marginPercent.toFixed(1)}%` : '—'}
            />
            <MetricCard
              label="Cost coverage"
              value={report.costCoverage != null ? `${report.costCoverage.toFixed(0)}% of units` : '—'}
              hint={
                report.costCoverage != null && report.costCoverage < 100
                  ? 'Some sold copies had no acquisition cost on the order line'
                  : undefined
              }
            />
          </div>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-fg-muted">
              Optional: turn on profit metrics if you track what you paid for inventory (&ldquo;your cost&rdquo; when
              adding or editing listings).
            </p>
            <Button variant="secondary" size="sm" type="button" onClick={() => toggleProfitMetrics(true)}>
              Show profit &amp; COGS
            </Button>
          </CardBody>
        </Card>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Revenue over time"
            subtitle={revenueChartType === 'line' ? 'Trend in selected range' : 'Daily totals in selected range'}
            actions={
              <div
                className="inline-flex rounded-lg border border-border bg-bg p-0.5"
                role="group"
                aria-label="Revenue chart type"
              >
                <button
                  type="button"
                  onClick={() => setRevenueChartType('bar')}
                  aria-pressed={revenueChartType === 'bar'}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    revenueChartType === 'bar'
                      ? 'bg-surface text-fg shadow-sm'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <BarChart3 aria-hidden className="size-3.5" />
                  Bar
                </button>
                <button
                  type="button"
                  onClick={() => setRevenueChartType('line')}
                  aria-pressed={revenueChartType === 'line'}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    revenueChartType === 'line'
                      ? 'bg-surface text-fg shadow-sm'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <LineChartIcon aria-hidden className="size-3.5" />
                  Line
                </button>
              </div>
            }
          />
          <CardBody>
            <RevenueOverTimeChart points={dailyBuckets} chartType={revenueChartType} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sales by channel" subtitle="Revenue-generating orders only" />
          <CardBody>
            <DonutChart
              segments={[
                { label: 'Online storefront', value: channelBreakdown.online },
                { label: 'In-store kiosk', value: channelBreakdown.kiosk },
              ]}
              centerValue={formatPrice(channelBreakdown.online + channelBreakdown.kiosk)}
              centerLabel="Revenue"
            />
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Top sellers" subtitle="By line revenue in range" />
          <CardBody>
            <HorizontalBarList
              rows={topCards.map((row) => ({
                label: row.name,
                value: row.revenueCents,
                display: `${formatPrice(row.revenueCents)} · ${row.units} sold`,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Orders by status" subtitle="Total value per status in range" />
          <CardBody>
            <StatusBarChart rows={statusChartRows} />
            {report.refundedCents > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-sm text-fg-muted">
                Refunded value in range: {formatPrice(report.refundedCents)}
              </p>
            )}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="Recent orders in range" />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Reference</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH>Total</TH>
                <TH>Date</TH>
              </TR>
            </THead>
            <TBody>
              {report.revenueOrders.slice(0, 12).map((order) => (
                <TR key={order.id}>
                  <TD className="font-mono text-xs">{order.reference}</TD>
                  <TD>{order.customerName ?? '—'}</TD>
                  <TD>
                    <Badge className="uppercase">{order.status}</Badge>
                  </TD>
                  <TD>{formatPrice(order.totalCents)}</TD>
                  <TD className="text-fg-muted">{formatDate(order.createdAt)}</TD>
                </TR>
              ))}
              {report.revenueOrders.length === 0 && (
                <EmptyRow colSpan={5}>No revenue orders in this date range.</EmptyRow>
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      {report.orderCount === 0 && orders.length === 0 && (
        <p className="text-xs text-fg-muted">
          No orders yet. In local dev, run{' '}
          <code className="text-fg">php bin/console app:seed-report-demo --slug={slug}</code> to add sample report data.
        </p>
      )}
    </div>
  )
}
