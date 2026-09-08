import { lazy, startTransition, Suspense, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, CalendarRange, Heart, LineChart as LineChartIcon, List, TrendingUp } from 'lucide-react'
import api, { formatPrice, httpStatus } from '../../api/client'
import type { StoreWantListReport, StoreWantListReportItem } from '../../api/types'
import { useAllStoreOrders } from '../../hooks'
import { formatDate } from '../../lib/format'
import {
  bucketRevenueByDay,
  computeReportMetrics,
  filterOrdersByRange,
  ordersByChannel,
  readShowProfitMetrics,
  resolveDateRange,
  topCardsByRevenue,
  topCardsByUnits,
  writeShowProfitMetrics,
  type DateRangePreset,
  type TopSellerMetric,
} from '../../lib/reports'
import type { RevenueChartType } from '../../components/reports/ReportCharts'
import { DateRangeCalendar } from '../../components/reports/DateRangeCalendar'
import { AnimatePresence, EASE_PREMIUM, HoverLift, motion, Reveal, Stagger, StaggerItem } from '../../components/motion'
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
  Button,
  Modal,
  Skeleton,
} from '../../components/ui'

const RevenueOverTimeChart = lazy(() =>
  import('../../components/reports/ReportCharts').then((m) => ({ default: m.RevenueOverTimeChart })),
)
const DonutChart = lazy(() =>
  import('../../components/reports/ReportCharts').then((m) => ({ default: m.DonutChart })),
)
const HorizontalBarList = lazy(() =>
  import('../../components/reports/ReportCharts').then((m) => ({ default: m.HorizontalBarList })),
)
const StatusBarChart = lazy(() =>
  import('../../components/reports/ReportCharts').then((m) => ({ default: m.StatusBarChart })),
)
const WantListBarChart = lazy(() =>
  import('../../components/reports/ReportCharts').then((m) => ({ default: m.WantListBarChart })),
)

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

function ChartFallback({ label = 'Loading chart…' }: { label?: string }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-fg-muted">{label}</p>
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <HoverLift>
      <Card>
        <CardBody>
          <p className="text-sm text-fg-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-fg">{value}</p>
          {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
        </CardBody>
      </Card>
    </HoverLift>
  )
}

export default function ReportsTab({ slug }: { slug: string }) {
  const { data: orders = [], isLoading, isFetching, error } = useAllStoreOrders(slug)
  const wantListQuery = useQuery({
    queryKey: ['store-want-list-report', slug],
    queryFn: async () => {
      const { data } = await api.get<StoreWantListReport>(`/stores/${slug}/reports/want-list`, {
        params: { limit: 100 },
      })
      return data
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
  const [wantListOpen, setWantListOpen] = useState(false)
  const [preset, setPreset] = useState<DateRangePreset>('90d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [revenueChartType, setRevenueChartType] = useState<RevenueChartType>('bar')
  const [topSellerMetric, setTopSellerMetric] = useState<TopSellerMetric>('revenue')
  const [showProfitMetrics, setShowProfitMetrics] = useState(() => readShowProfitMetrics(slug))

  function toggleProfitMetrics(enabled: boolean) {
    setShowProfitMetrics(enabled)
    writeShowProfitMetrics(slug, enabled)
  }

  function selectPreset(next: DateRangePreset) {
    startTransition(() => setPreset(next))
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
      const orderCount = slice.reduce((s, b) => s + b.orderCount, 0)
      chunked.push({
        label: slice.length === 1 ? slice[0].label : `${slice[0].label} – ${slice[slice.length - 1].label}`,
        value: revenue,
        secondary: orderCount ? `${orderCount} orders` : undefined,
      })
    }
    return chunked
  }, [filteredOrders, range])

  const topCards = useMemo(
    () =>
      topSellerMetric === 'units'
        ? topCardsByUnits(filteredOrders)
        : topCardsByRevenue(filteredOrders),
    [filteredOrders, topSellerMetric],
  )

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
      <Reveal immediate y={10}>
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
            {isFetching && !isLoading ? (
              <span className="text-xs text-fg-muted">Refreshing…</span>
            ) : null}
          </p>
        </div>
      </Reveal>

      <Reveal immediate delay={0.04} y={12}>
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Date range preset">
              {PRESETS.map((item) => (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => selectPreset(item.id)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.18, ease: EASE_PREMIUM }}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                    preset === item.id
                      ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                      : 'border-border bg-surface text-fg-muted hover:border-brand-400 hover:text-fg',
                  )}
                >
                  {item.label}
                </motion.button>
              ))}
            </div>

            <AnimatePresence initial={false}>
              {preset === 'custom' ? (
                <motion.div
                  key="custom-calendar"
                  initial={{ opacity: 0, height: 0, y: -8 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  transition={{ duration: 0.32, ease: EASE_PREMIUM }}
                  className="overflow-hidden"
                >
                  <DateRangeCalendar
                    from={customFrom}
                    to={customTo}
                    onChange={(nextFrom, nextTo) => {
                      startTransition(() => {
                        setCustomFrom(nextFrom)
                        setCustomTo(nextTo)
                      })
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <p className="text-xs text-fg-muted">
              {isLoading ? (
                'Loading orders…'
              ) : (
                <>
                  Showing {report.orderCount} order{report.orderCount === 1 ? '' : 's'} in range
                  {orders.length > report.orderCount ? ` (${orders.length} total loaded)` : ''}.
                </>
              )}
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
      </Reveal>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardBody className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </CardBody>
              </Card>
            ))}
          </div>
          <LoadingPanel label="Loading reports…" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${preset}-${customFrom}-${customTo}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: EASE_PREMIUM }}
            className="space-y-6"
          >
            <Stagger immediate gap={0.05} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StaggerItem>
                <MetricCard label="Revenue" value={formatPrice(report.revenueCents)} />
              </StaggerItem>
              <StaggerItem>
                <MetricCard label="Revenue orders" value={report.revenueOrders.length} />
              </StaggerItem>
              <StaggerItem>
                <MetricCard label="Average order" value={formatPrice(report.averageOrderCents)} />
              </StaggerItem>
              <StaggerItem>
                <MetricCard label="Pending value" value={formatPrice(report.pendingCents)} />
              </StaggerItem>
            </Stagger>

            <AnimatePresence initial={false} mode="wait">
              {showProfitMetrics ? (
                <motion.div
                  key="profit-on"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-fg">Profit metrics</p>
                    <Button variant="ghost" size="sm" type="button" onClick={() => toggleProfitMetrics(false)}>
                      Hide
                    </Button>
                  </div>
                  <Stagger immediate gap={0.05} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StaggerItem>
                      <MetricCard label="Cost of goods sold" value={formatPrice(report.cogsCents)} />
                    </StaggerItem>
                    <StaggerItem>
                      <MetricCard label="Gross profit" value={formatPrice(report.grossProfitCents)} />
                    </StaggerItem>
                    <StaggerItem>
                      <MetricCard
                        label="Gross margin"
                        value={report.marginPercent != null ? `${report.marginPercent.toFixed(1)}%` : '—'}
                      />
                    </StaggerItem>
                    <StaggerItem>
                      <MetricCard
                        label="Cost coverage"
                        value={report.costCoverage != null ? `${report.costCoverage.toFixed(0)}% of units` : '—'}
                        hint={
                          report.costCoverage != null && report.costCoverage < 100
                            ? 'Some sold copies had no acquisition cost on the order line'
                            : undefined
                        }
                      />
                    </StaggerItem>
                  </Stagger>
                </motion.div>
              ) : (
                <motion.div
                  key="profit-off"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                >
                  <Card className="border-dashed">
                    <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-fg-muted">
                        Optional: turn on profit metrics if you track what you paid for inventory (&ldquo;your
                        cost&rdquo; when adding or editing listings).
                      </p>
                      <Button variant="secondary" size="sm" type="button" onClick={() => toggleProfitMetrics(true)}>
                        Show profit &amp; COGS
                      </Button>
                    </CardBody>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <Suspense fallback={<ChartFallback />}>
              <section className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Revenue over time"
                    subtitle={
                      revenueChartType === 'line' ? 'Trend in selected range' : 'Daily totals in selected range'
                    }
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
                        { label: 'Kiosk', value: channelBreakdown.kiosk },
                      ]}
                      centerValue={formatPrice(channelBreakdown.online + channelBreakdown.kiosk)}
                      centerLabel="Revenue"
                    />
                  </CardBody>
                </Card>
              </section>

              <section className="mt-6 grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Top sellers"
                    subtitle={
                      topSellerMetric === 'units'
                        ? 'Cards sold the most (units) in range'
                        : 'By line revenue in range'
                    }
                    actions={
                      <div
                        className="inline-flex rounded-lg border border-border bg-bg p-0.5"
                        role="group"
                        aria-label="Top sellers metric"
                      >
                        <button
                          type="button"
                          onClick={() => setTopSellerMetric('revenue')}
                          aria-pressed={topSellerMetric === 'revenue'}
                          className={cx(
                            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                            topSellerMetric === 'revenue'
                              ? 'bg-surface text-fg shadow-sm'
                              : 'text-fg-muted hover:text-fg',
                          )}
                        >
                          Revenue
                        </button>
                        <button
                          type="button"
                          onClick={() => setTopSellerMetric('units')}
                          aria-pressed={topSellerMetric === 'units'}
                          className={cx(
                            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                            topSellerMetric === 'units'
                              ? 'bg-surface text-fg shadow-sm'
                              : 'text-fg-muted hover:text-fg',
                          )}
                        >
                          Units sold
                        </button>
                      </div>
                    }
                  />
                  <CardBody>
                    <HorizontalBarList
                      valueKind={topSellerMetric === 'units' ? 'count' : 'money'}
                      seriesLabel={topSellerMetric === 'units' ? 'Units' : 'Revenue'}
                      valueFormatter={
                        topSellerMetric === 'units' ? (n) => `${n} sold` : (n) => formatPrice(n)
                      }
                      rows={topCards.map((row) => ({
                        label: row.name,
                        value: topSellerMetric === 'units' ? row.units : row.revenueCents,
                        display:
                          topSellerMetric === 'units'
                            ? `${row.units} sold · ${formatPrice(row.revenueCents)}`
                            : `${formatPrice(row.revenueCents)} · ${row.units} sold`,
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

              <Card className="mt-6">
                <CardHeader
                  title="Most wanted cards"
                  subtitle="From customer want lists at this store — demand signal for buying and stocking"
                  actions={
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={wantListQuery.isLoading || (wantListQuery.data?.items.length ?? 0) === 0}
                      onClick={() => setWantListOpen(true)}
                    >
                      <List aria-hidden className="size-4" />
                      View list
                    </Button>
                  }
                />
                <CardBody>
                  {wantListQuery.isLoading ? (
                    <p className="text-sm text-fg-muted">Loading want lists…</p>
                  ) : wantListQuery.isError ? (
                    <p className="text-sm text-danger-700">Could not load want-list analytics.</p>
                  ) : (wantListQuery.data?.items.length ?? 0) === 0 ? (
                    <EmptyState
                      icon={Heart}
                      title="No want-list demand yet"
                      description="When shoppers save cards to their want list at this store, they show up here ranked by quantity."
                    />
                  ) : (
                    <WantListBarChart
                      rows={(wantListQuery.data?.items ?? []).map((row) => ({
                        cardName: row.cardName,
                        quantity: row.quantity,
                        wanters: row.wanters,
                        finish: row.finish,
                      }))}
                    />
                  )}
                </CardBody>
              </Card>
            </Suspense>

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
                <code className="text-fg">php bin/console app:seed-report-demo --slug={slug}</code> to add
                sample report data.
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <Modal
        open={wantListOpen}
        onClose={() => setWantListOpen(false)}
        title="All wanted cards"
        className="max-w-3xl"
        footer={
          <Button variant="secondary" onClick={() => setWantListOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="mb-4 text-sm text-fg-muted">
          Ranked by total quantity on customer want lists at this store.
        </p>
        <WantListTable items={wantListQuery.data?.items ?? []} />
      </Modal>
    </div>
  )
}

function WantListTable({ items }: { items: StoreWantListReportItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-fg-muted">No want-list entries yet.</p>
  }

  return (
    <div className="max-h-[min(28rem,60vh)] overflow-auto rounded-xl border border-border">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Card</TH>
            <TH className="text-right">Wanted</TH>
            <TH className="text-right">Shoppers</TH>
            <TH>Finish</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((row) => (
            <TR key={`${row.cardName}-${row.finish}-${row.setCode ?? ''}`}>
              <TD>
                <p className="font-medium text-fg">{row.cardName}</p>
                {row.setCode ? <p className="text-xs text-fg-muted">{row.setCode}</p> : null}
              </TD>
              <TD className="text-right tabular-nums">{row.quantity}</TD>
              <TD className="text-right tabular-nums">{row.wanters}</TD>
              <TD className="text-fg-muted">{row.finish}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
