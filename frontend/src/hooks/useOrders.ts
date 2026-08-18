import { useQuery } from '@tanstack/react-query'
import api, { unwrapCollection } from '../api/client'
import type { Order } from '../api/types'
import type { OrderListTab } from '../lib/orderManagementUi'

/** React Query key for a store's orders. */
export const ordersKey = (slug: string) => ['orders', slug] as const

export const openStoreOrdersCountKey = (slug: string) => [...ordersKey(slug), 'open-count'] as const

export interface StoreOrderQueueCounts {
  openCount: number
  pending: number
  processing: number
  delivery: number
  ready: number
  delivered: number
  /** Every order in the store (all statuses) — for All tab pagination. */
  total: number
}

const EMPTY_QUEUE_COUNTS: StoreOrderQueueCounts = {
  openCount: 0,
  pending: 0,
  processing: 0,
  delivery: 0,
  ready: 0,
  delivered: 0,
  total: 0,
}

function parseQueueCounts(data: unknown): StoreOrderQueueCounts {
  if (!data || typeof data !== 'object') return EMPTY_QUEUE_COUNTS
  const row = data as Record<string, unknown>
  const pending = Math.max(0, Number(row.pending) || 0)
  const processing = Math.max(0, Number(row.processing) || 0)
  const delivery = Math.max(0, Number(row.delivery) || 0)
  const ready = Math.max(0, Number(row.ready) || 0)
  const delivered = Math.max(0, Number(row.delivered) || 0)
  const total = Math.max(0, Number(row.total) || 0)
  const openCount = Math.max(0, Number(row.openCount) || pending + processing + delivery + ready)
  return { openCount, pending, processing, delivery, ready, delivered, total }
}

/** Admin order table page size — must not exceed the API's itemsPerPage cap (200). */
export const ADMIN_ORDERS_PAGE_SIZE = 8

export interface StoreOrdersPage {
  items: Order[]
  total: number
  page: number
  itemsPerPage: number
}

function parseStoreOrdersPage(data: unknown, page: number, itemsPerPage: number): StoreOrdersPage {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page, itemsPerPage }
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  if (!record) {
    return { items: [], total: 0, page, itemsPerPage }
  }

  const items = Array.isArray(record.items)
    ? (record.items as Order[])
    : unwrapCollection(data as Order[] | { member?: Order[] })

  const meta = record.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : null
  const totalRaw =
    record.totalItems ??
    record['hydra:totalItems'] ??
    record.total ??
    meta?.totalItems ??
    (record.view && typeof record.view === 'object'
      ? (record.view as Record<string, unknown>)['hydra:totalItems'] ??
        (record.view as Record<string, unknown>).totalItems
      : undefined)

  const total =
    totalRaw !== undefined && totalRaw !== null && totalRaw !== ''
      ? Math.max(0, Number(totalRaw) || 0)
      : items.length

  return {
    items,
    total,
    page: Math.max(1, Number(record.page ?? page) || page),
    itemsPerPage: Math.max(1, Number(record.itemsPerPage ?? itemsPerPage) || itemsPerPage),
  }
}

/** Total rows for the active tab — API total when present, else tab badge count from queue summary. */
export function resolveOrdersListTotal(
  tab: OrderListTab,
  orderTotal: number,
  queueCounts: StoreOrderQueueCounts | undefined,
): number {
  if (tab === 'all') {
    const summaryTotal = queueCounts?.total ?? 0
    return Math.max(orderTotal, summaryTotal)
  }
  const tabTotal = (() => {
    switch (tab) {
      case 'pending':
        return queueCounts?.pending ?? 0
      case 'processing':
        return queueCounts?.processing ?? 0
      case 'delivery':
        return queueCounts?.delivery ?? 0
      case 'ready':
        return queueCounts?.ready ?? 0
      case 'delivered':
        return queueCounts?.delivered ?? 0
      default:
        return 0
    }
  })()
  return Math.max(orderTotal, tabTotal)
}

/**
 * One page of a store's orders (newest first). Use for admin Orders tab — do not
 * aggregate every page client-side.
 */
export function useOrdersPage(
  slug: string,
  page: number,
  itemsPerPage = ADMIN_ORDERS_PAGE_SIZE,
  queue?: OrderListTab,
) {
  const queueParam = queue && queue !== 'all' ? queue : undefined
  const queueKey = queueParam ?? 'all'
  return useQuery({
    queryKey: [...ordersKey(slug), page, itemsPerPage, queueKey],
    enabled: Boolean(slug),
    retry: false,
    // Short but non-zero: revisiting the tab renders the cached page instantly
    // and refreshes behind it, instead of blanking to a loading panel. Status
    // changes invalidate this key directly, so actions still show immediately.
    staleTime: 15_000,
    // Keep previous page only within the same tab — never show Processing rows on Delivered.
    placeholderData: (previousData, previousQuery) => {
      const prevKey = previousQuery?.queryKey
      if (!prevKey || prevKey[4] !== queueKey) return undefined
      return previousData
    },
    queryFn: async () => {
      const { data } = await api.get(`/stores/${slug}/orders`, {
        params: {
          page,
          itemsPerPage,
          ...(queueParam ? { queue: queueParam } : {}),
        },
      })
      return parseStoreOrdersPage(data, page, itemsPerPage)
    },
  })
}

/**
 * Server-backed queue counts for admin Orders nav + tab badges.
 */
export function useStoreOrderQueueCounts(slug: string, enabled = true) {
  return useQuery({
    queryKey: openStoreOrdersCountKey(slug),
    enabled: Boolean(slug) && enabled,
    retry: false,
    // The 30s poll keeps the badges live; this stops every tab switch from
    // firing an extra count request on top of it.
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await api.get<StoreOrderQueueCounts>(`/stores/${slug}/orders-open-count`)
      return parseQueueCounts(data)
    },
  })
}

/** Sidebar badge — total open queue (pending + processing + delivery). */
export function useOpenStoreOrderCount(slug: string, enabled = true) {
  const query = useStoreOrderQueueCounts(slug, enabled)
  return {
    ...query,
    data: query.data?.openCount ?? 0,
  }
}

/** Walk pages for reports that need the full set (bounded). */
const MAX_AGGREGATE_PAGES = 100

export function useAllStoreOrders(slug: string, enabled = true) {
  return useQuery({
    queryKey: [...ordersKey(slug), 'aggregate'],
    enabled: Boolean(slug) && enabled,
    retry: false,
    queryFn: async () => {
      const orders: Order[] = []
      const itemsPerPage = 200
      for (let page = 1; page <= MAX_AGGREGATE_PAGES; page++) {
        const { data } = await api.get(`/stores/${slug}/orders`, {
          params: { page, itemsPerPage },
        })
        const chunk = parseStoreOrdersPage(data, page, itemsPerPage).items
        orders.push(...chunk)
        if (chunk.length < itemsPerPage) break
      }
      return orders
    },
  })
}

/** @deprecated use useOrdersPage — kept as alias for imports that pass page */
export function useOrders(slug: string, page = 1, itemsPerPage = ADMIN_ORDERS_PAGE_SIZE, queue?: OrderListTab) {
  return useOrdersPage(slug, page, itemsPerPage, queue)
}

export default useOrdersPage
