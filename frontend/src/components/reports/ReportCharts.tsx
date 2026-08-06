import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPrice } from '../../api/client'
import { useTheme } from '../../hooks'
import { cx } from '../../lib/cx'
import { chartPalette, chartSeriesColors } from '../../lib/reportChartTheme'

export interface BarChartPoint {
  label: string
  value: number
  secondary?: string
}

function ChartEmpty({ message, className }: { message: string; className?: string }) {
  return <p className={cx('py-12 text-center text-sm text-fg-muted', className)}>{message}</p>
}

type RevenueRow = {
  label: string
  revenueCents: number
  revenue: number
  orderHint?: string
}

function RevenueTooltip({
  active,
  payload,
  valueFormatter,
}: {
  active?: boolean
  payload?: { payload: RevenueRow }[]
  valueFormatter: (cents: number) => string
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card">
      <p className="font-bold text-fg">{row.label}</p>
      <p className="tabular-nums text-fg">{valueFormatter(row.revenueCents)}</p>
      {row.orderHint && <p className="text-xs text-fg-muted">{row.orderHint}</p>}
    </div>
  )
}

export interface BarChartProps {
  points: BarChartPoint[]
  valueFormatter?: (cents: number) => string
  className?: string
  emptyLabel?: string
}

export type RevenueChartType = 'bar' | 'line'

export interface RevenueOverTimeChartProps extends BarChartProps {
  chartType?: RevenueChartType
}

function revenueChartData(points: BarChartPoint[]): RevenueRow[] {
  return points.map((p) => ({
    label: p.label,
    revenueCents: p.value,
    revenue: p.value / 100,
    orderHint: p.secondary,
  }))
}

function RevenueChartAxes({
  palette,
  tickInterval,
}: {
  palette: ReturnType<typeof chartPalette>
  tickInterval: number
}) {
  return (
    <>
      <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: palette.tick, fontSize: 11 }}
        interval={tickInterval}
        tickLine={false}
        axisLine={{ stroke: palette.grid }}
      />
      <YAxis
        tick={{ fill: palette.tick, fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
      />
    </>
  )
}

/** Daily (or bucketed) revenue — bar or line. Values are cents. */
export function RevenueOverTimeChart({
  points,
  valueFormatter = (v) => formatPrice(v),
  className,
  emptyLabel = 'No revenue in this period.',
  chartType = 'bar',
}: RevenueOverTimeChartProps) {
  const { theme } = useTheme()
  const palette = chartPalette(theme)
  const hasData = points.some((p) => p.value > 0)

  if (!hasData) {
    return <ChartEmpty message={emptyLabel} className={className} />
  }

  const data = revenueChartData(points)
  const tickInterval = points.length > 20 ? Math.ceil(points.length / 12) : 0

  return (
    <div className={cx('h-64 w-full min-w-0', className)}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'line' ? (
          <RechartsLineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <RevenueChartAxes palette={palette} tickInterval={tickInterval} />
            <Tooltip content={<RevenueTooltip valueFormatter={valueFormatter} />} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke={palette.brand}
              strokeWidth={2.5}
              dot={{ r: 3, fill: palette.brand, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: palette.brand, stroke: palette.tooltipBg, strokeWidth: 2 }}
            />
          </RechartsLineChart>
        ) : (
          <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <RevenueChartAxes palette={palette} tickInterval={tickInterval} />
            <Tooltip
              cursor={{ fill: palette.grid, opacity: 0.35 }}
              content={<RevenueTooltip valueFormatter={valueFormatter} />}
            />
            <Bar dataKey="revenue" fill={palette.brand} radius={[4, 4, 0, 0]} maxBarSize={48} />
          </RechartsBarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

/** @deprecated alias — prefer RevenueOverTimeChart */
export function BarChart(props: BarChartProps) {
  return <RevenueOverTimeChart {...props} chartType="bar" />
}

export interface DonutSegment {
  label: string
  value: number
  color?: string
}

export interface DonutChartProps {
  segments: DonutSegment[]
  centerLabel?: string
  centerValue?: string
  className?: string
}

export function DonutChart({ segments, centerLabel, centerValue, className }: DonutChartProps) {
  const { theme } = useTheme()
  const palette = chartPalette(theme)
  const colors = chartSeriesColors(theme)
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  if (total <= 0) {
    return <ChartEmpty message="No data for this breakdown." className={className} />
  }

  const data = segments
    .filter((s) => s.value > 0)
    .map((s, i) => ({
      name: s.label,
      value: s.value,
      fill: s.color ?? colors[i % colors.length],
    }))

  return (
    <div className={cx('relative w-full min-w-0', className)}>
      <div className="relative h-64 w-full">
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
            {centerValue && <span className="text-lg font-bold tabular-nums text-fg">{centerValue}</span>}
            {centerLabel && <span className="text-xs text-fg-muted">{centerLabel}</span>}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              stroke={palette.tooltipBg}
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatPrice(Number(value ?? 0))}
              contentStyle={{
                backgroundColor: palette.tooltipBg,
                borderColor: palette.tooltipBorder,
                color: palette.tooltipFg,
                borderRadius: 8,
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: d.fill }} aria-hidden />
            {d.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface HorizontalBarRow {
  label: string
  value: number
  display?: string
}

type TopSellerRow = {
  name: string
  fullName: string
  revenueCents: number
  revenue: number
  display?: string
}

export function HorizontalBarList({
  rows,
  valueFormatter = (v) => formatPrice(v),
}: {
  rows: HorizontalBarRow[]
  valueFormatter?: (n: number) => string
  maxValue?: number
}) {
  const { theme } = useTheme()
  const palette = chartPalette(theme)

  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">Nothing to show yet.</p>
  }

  const data: TopSellerRow[] = [...rows]
    .sort((a, b) => b.value - a.value)
    .map((row) => ({
      name: row.label.length > 28 ? `${row.label.slice(0, 26)}…` : row.label,
      fullName: row.label,
      revenueCents: row.value,
      revenue: row.value / 100,
      display: row.display,
    }))

  return (
    <div className="h-[min(22rem,28vh+12rem)] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart layout="vertical" data={data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: palette.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={{ fill: palette.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: palette.grid, opacity: 0.25 }}
            formatter={(_v, _n, item) => {
              const row = item.payload as TopSellerRow
              return [row.display ?? valueFormatter(row.revenueCents), 'Revenue']
            }}
            labelFormatter={(_label, payload) => {
              const row = payload?.[0]?.payload as TopSellerRow | undefined
              return row?.fullName ?? ''
            }}
            contentStyle={{
              backgroundColor: palette.tooltipBg,
              borderColor: palette.tooltipBorder,
              color: palette.tooltipFg,
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Bar dataKey="revenue" fill={palette.brandMuted} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Order value by status — colored bars. */
export function StatusBarChart({
  rows,
  className,
}: {
  rows: { status: string; count: number; totalCents: number }[]
  className?: string
}) {
  const { theme } = useTheme()
  const palette = chartPalette(theme)
  const colors = chartSeriesColors(theme)

  if (rows.length === 0) {
    return <ChartEmpty message="No orders in range." className={className} />
  }

  const data = rows.map((row, i) => ({
    name: row.status.toUpperCase(),
    totalCents: row.totalCents,
    total: row.totalCents / 100,
    count: row.count,
    fill: colors[i % colors.length],
  }))

  return (
    <div className={cx('h-56 w-full min-w-0', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: palette.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
          />
          <YAxis
            tick={{ fill: palette.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            formatter={(v, _n, item) => {
              const row = item.payload as (typeof data)[number]
              return [formatPrice(Math.round(Number(v ?? 0) * 100)), `${row.count} order${row.count === 1 ? '' : 's'}`]
            }}
            contentStyle={{
              backgroundColor: palette.tooltipBg,
              borderColor: palette.tooltipBorder,
              color: palette.tooltipFg,
              borderRadius: 8,
            }}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
