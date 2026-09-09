import type { Order } from '../api/types'

export const REVENUE_STATUSES = new Set(['paid', 'shipped', 'completed', 'fulfilled'])

export type DateRangePreset = '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom'

export interface ReportDateRange {
  preset: DateRangePreset
  from: Date
  to: Date
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/** Local calendar day key (YYYY-MM-DD) — never use UTC ISO slice for day buckets. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function orderLocalDayKey(createdAt: string): string {
  return localDayKey(new Date(createdAt))
}

export function resolveDateRange(preset: DateRangePreset, customFrom?: string, customTo?: string): ReportDateRange {
  const today = startOfDay(new Date())
  const to = endOfDay(today)

  switch (preset) {
    case '7d':
      return { preset, from: startOfDay(new Date(today.getTime() - 6 * 86400000)), to }
    case '30d':
      return { preset, from: startOfDay(new Date(today.getTime() - 29 * 86400000)), to }
    case '90d':
      return { preset, from: startOfDay(new Date(today.getTime() - 89 * 86400000)), to }
    case 'ytd':
      return { preset, from: new Date(today.getFullYear(), 0, 1), to }
    case 'all':
      return { preset, from: new Date(2000, 0, 1), to }
    case 'custom': {
      const from = customFrom ? startOfDay(new Date(`${customFrom}T12:00:00`)) : startOfDay(new Date(today.getTime() - 29 * 86400000))
      const customEnd = customTo ? endOfDay(new Date(`${customTo}T12:00:00`)) : to
      return { preset, from, to: customEnd }
    }
    default:
      return resolveDateRange('30d')
  }
}

export function orderInRange(order: Order, range: ReportDateRange): boolean {
  const t = new Date(order.createdAt).getTime()
  return t >= range.from.getTime() && t <= range.to.getTime()
}

export function filterOrdersByRange(orders: Order[], range: ReportDateRange): Order[] {
  return orders.filter((order) => orderInRange(order, range))
}

export interface TimeBucket {
  key: string
  label: string
  revenueCents: number
  orderCount: number
}

/** Bucket revenue orders by calendar day (local timezone). */
export function bucketRevenueByDay(orders: Order[], range: ReportDateRange): TimeBucket[] {
  const revenueOrders = orders.filter((o) => REVENUE_STATUSES.has(o.status))
  const map = new Map<string, TimeBucket>()

  const cursor = startOfDay(range.from)
  const end = startOfDay(range.to)
  while (cursor <= end) {
    const key = localDayKey(cursor)
    map.set(key, {
      key,
      label: cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenueCents: 0,
      orderCount: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  for (const order of revenueOrders) {
    const key = orderLocalDayKey(order.createdAt)
    const bucket = map.get(key)
    if (!bucket) continue
    bucket.revenueCents += order.totalCents
    bucket.orderCount += 1
  }

  return Array.from(map.values())
}

export interface TopCardRow {
  name: string
  revenueCents: number
  units: number
}

export type TopSellerMetric = 'revenue' | 'units'

export function topCardsByRevenue(orders: Order[], limit = 8): TopCardRow[] {
  return rankTopCards(orders, 'revenue', limit)
}

export function topCardsByUnits(orders: Order[], limit = 8): TopCardRow[] {
  return rankTopCards(orders, 'units', limit)
}

function rankTopCards(orders: Order[], metric: TopSellerMetric, limit: number): TopCardRow[] {
  const totals = new Map<string, { revenueCents: number; units: number }>()
  for (const order of orders) {
    if (!REVENUE_STATUSES.has(order.status)) continue
    for (const line of order.lines ?? []) {
      const row = totals.get(line.cardName) ?? { revenueCents: 0, units: 0 }
      row.revenueCents += line.quantity * line.priceCents
      row.units += line.quantity
      totals.set(line.cardName, row)
    }
  }
  return Array.from(totals, ([name, row]) => ({ name, ...row }))
    .sort((a, b) =>
      metric === 'units'
        ? b.units - a.units || b.revenueCents - a.revenueCents
        : b.revenueCents - a.revenueCents || b.units - a.units,
    )
    .slice(0, limit)
}

export interface ChannelBreakdown {
  online: number
  kiosk: number
}

export function ordersByChannel(orders: Order[]): ChannelBreakdown {
  let online = 0
  let kiosk = 0
  for (const order of orders) {
    if (!REVENUE_STATUSES.has(order.status)) continue
    if (order.channel === 'kiosk') kiosk += order.totalCents
    else online += order.totalCents
  }
  return { online, kiosk }
}

export interface ReportMetrics {
  revenueOrders: Order[]
  revenueCents: number
  pendingCents: number
  refundedCents: number
  averageOrderCents: number
  cogsCents: number
  grossProfitCents: number
  marginPercent: number | null
  costCoverage: number | null
  statusRows: [string, { count: number; totalCents: number }][]
  orderCount: number
}

export function computeReportMetrics(orders: Order[]): ReportMetrics {
  const revenueOrders = orders.filter((order) => REVENUE_STATUSES.has(order.status))
  const revenueCents = revenueOrders.reduce((sum, order) => sum + order.totalCents, 0)
  const pendingCents = orders
    .filter((order) => order.status === 'pending')
    .reduce((sum, order) => sum + order.totalCents, 0)
  const refundedCents = orders
    .filter((order) => order.status === 'refunded')
    .reduce((sum, order) => sum + order.totalCents, 0)
  const averageOrderCents = revenueOrders.length > 0 ? Math.round(revenueCents / revenueOrders.length) : 0

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
    orderCount: orders.length,
  }
}

const PROFIT_METRICS_STORAGE_PREFIX = 'store-reports-profit:'

export function readShowProfitMetrics(slug: string): boolean {
  try {
    return localStorage.getItem(`${PROFIT_METRICS_STORAGE_PREFIX}${slug}`) === '1'
  } catch {
    return false
  }
}

export function writeShowProfitMetrics(slug: string, enabled: boolean): void {
  try {
    localStorage.setItem(`${PROFIT_METRICS_STORAGE_PREFIX}${slug}`, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
