import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { formatPrice, httpStatus } from '../../api/client'
import { useOrders } from '../../hooks'
import { formatDate } from '../../lib/format'
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
} from '../../components/ui'

const REVENUE_STATUSES = new Set(['paid', 'shipped', 'completed'])

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="mt-2 text-2xl font-bold text-fg">{value}</p>
      </CardBody>
    </Card>
  )
}

export default function ReportsTab({ slug }: { slug: string }) {
  const { data: orders = [], isLoading, error } = useOrders(slug)

  const report = useMemo(() => {
    const revenueOrders = orders.filter((order) => REVENUE_STATUSES.has(order.status))
    const revenueCents = revenueOrders.reduce((sum, order) => sum + order.totalCents, 0)
    const pendingCents = orders
      .filter((order) => order.status === 'pending')
      .reduce((sum, order) => sum + order.totalCents, 0)
    const refundedCents = orders
      .filter((order) => order.status === 'refunded')
      .reduce((sum, order) => sum + order.totalCents, 0)
    const averageOrderCents =
      revenueOrders.length > 0 ? Math.round(revenueCents / revenueOrders.length) : 0

    // COGS from the per-unit cost snapshotted on each line at sale time.
    // Units without a tracked cost count as zero; costCoverage surfaces how
    // much of the sold volume actually has cost data so the profit numbers
    // are read with the right confidence.
    let cogsCents = 0
    let unitsSold = 0
    let unitsWithCost = 0
    for (const order of revenueOrders) {
      for (const line of order.lines ?? []) {
        unitsSold += line.quantity
        if (line.acquisitionCostCents != null) {
          unitsWithCost += line.quantity
          cogsCents += line.acquisitionCostCents * line.quantity
        }
      }
    }
    const grossProfitCents = revenueCents - cogsCents
    const marginPercent = revenueCents > 0 ? (grossProfitCents / revenueCents) * 100 : null
    const costCoverage = unitsSold > 0 ? (unitsWithCost / unitsSold) * 100 : null

    const statusRows = Object.entries(
      orders.reduce<Record<string, { count: number; totalCents: number }>>((acc, order) => {
        acc[order.status] ??= { count: 0, totalCents: 0 }
        acc[order.status].count += 1
        acc[order.status].totalCents += order.totalCents
        return acc
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b))

    return {
      revenueOrders,
      revenueCents,
      pendingCents,
      refundedCents,
      averageOrderCents,
      cogsCents,
      grossProfitCents,
      marginPercent,
      costCoverage,
      statusRows,
      recentOrders: revenueOrders.slice(0, 8),
    }
  }, [orders])

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
      <div>
        <h2 className="text-lg font-bold text-fg">Revenue report</h2>
        <p className="mt-1 text-sm text-fg-muted">Revenue includes paid, shipped, and completed orders.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Revenue generated" value={formatPrice(report.revenueCents)} />
        <MetricCard label="Revenue orders" value={report.revenueOrders.length} />
        <MetricCard label="Average order" value={formatPrice(report.averageOrderCents)} />
        <MetricCard label="Pending value" value={formatPrice(report.pendingCents)} />
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
        />
      </div>
      {report.costCoverage != null && report.costCoverage < 100 && (
        <p className="text-xs text-fg-muted">
          Cost coverage below 100% means some sold copies had no acquisition cost recorded — their COGS counts as
          $0, so gross profit reads high. Add &ldquo;your cost&rdquo; when adding or editing listings to tighten
          these numbers.
        </p>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title="Recent revenue orders" />
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
                {report.recentOrders.map((order) => (
                  <TR key={order.id}>
                    <TD className="font-mono text-xs">{order.reference}</TD>
                    <TD>{order.customerName ?? '-'}</TD>
                    <TD>
                      <Badge className="uppercase">{order.status}</Badge>
                    </TD>
                    <TD>{formatPrice(order.totalCents)}</TD>
                    <TD className="text-fg-muted">{formatDate(order.createdAt)}</TD>
                  </TR>
                ))}
                {report.recentOrders.length === 0 && (
                  <EmptyRow colSpan={5}>No revenue-generating orders yet.</EmptyRow>
                )}
              </TBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Totals by status" />
          <CardBody className="space-y-3">
            {report.statusRows.map(([statusName, row]) => (
              <div key={statusName} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-bold uppercase text-fg">{statusName}</p>
                  <p className="text-xs text-fg-muted">
                    {row.count} order{row.count === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="font-bold text-fg">{formatPrice(row.totalCents)}</p>
              </div>
            ))}
            {report.statusRows.length === 0 && (
              <p className="text-sm text-fg-muted">No orders to report yet.</p>
            )}
            {report.refundedCents > 0 && (
              <p className="border-t border-border pt-4 text-sm text-fg-muted">
                Refunded value: {formatPrice(report.refundedCents)}
              </p>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  )
}
