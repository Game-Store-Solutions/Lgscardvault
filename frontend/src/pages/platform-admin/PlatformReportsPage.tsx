import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Filter, RefreshCw, Search } from 'lucide-react'
import api, { formatPrice, unwrapCollection } from '../../api/client'
import type { Store } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'

export interface AdminSquareTransaction {
  orderId: number
  reference: string
  storeSlug: string | null
  storeName: string | null
  status: string
  paidCents: number
  paymentReference: string
  squareOrderId: string | null
  customerEmail: string | null
  createdAt: string
}

interface SquareTransactionsResponse {
  summary: { count: number; totalPaidCents: number }
  limit: number
  offset: number
  transactions: AdminSquareTransaction[]
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'received', label: 'Received' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'pending', label: 'Pending' },
]

const PAGE_SIZE = 50

/** Platform admin reports: storefront Square shopper payments across all stores. */
export default function PlatformReportsPage() {
  const [store, setStore] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [applied, setApplied] = useState({ store: '', status: '', q: '', from: '', to: '' })
  const [offset, setOffset] = useState(0)

  const storesQuery = useQuery({
    queryKey: ['admin-stores'],
    queryFn: async () => {
      const { data } = await api.get('/admin/stores')
      return unwrapCollection<Store>(data)
    },
  })

  const storeList = useMemo(() => {
    return (storesQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [storesQuery.data])

  const queryKey = ['admin-square-transactions', applied, offset] as const

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<SquareTransactionsResponse>('/admin/square/transactions', {
        params: {
          store: applied.store || undefined,
          status: applied.status || undefined,
          q: applied.q || undefined,
          from: applied.from || undefined,
          to: applied.to || undefined,
          limit: PAGE_SIZE,
          offset,
        },
      })
      return data
    },
  })

  function applyFilters() {
    setOffset(0)
    setApplied({ store, status, q: q.trim(), from, to })
  }

  function clearFilters() {
    setStore('')
    setStatus('')
    setQ('')
    setFrom('')
    setTo('')
    setOffset(0)
    setApplied({ store: '', status: '', q: '', from: '', to: '' })
  }

  const rows = data?.transactions ?? []
  const summary = data?.summary ?? { count: 0, totalPaidCents: 0 }
  const showingFrom = summary.count === 0 ? 0 : offset + 1
  const showingTo = Math.min(offset + rows.length, summary.count)
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < summary.count

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Storefront Square shopper payments across connected stores (not subscription billing)."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw aria-hidden className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Matching payments</p>
            <p className="mt-1 font-display text-2xl font-bold text-fg">{summary.count.toLocaleString()}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Total collected</p>
            <p className="mt-1 font-display text-2xl font-bold text-fg">{formatPrice(summary.totalPaidCents)}</p>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Filters"
          subtitle="Filter by store, status, date range, or search order / Square / email."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Select label="Store" value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">All stores</option>
              {storeList.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name} (/{s.slug})
                </option>
              ))}
            </Select>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Input
              label="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Order ref, email, Square id…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters()
              }}
            />
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={applyFilters}>
              <Filter aria-hidden className="size-4" />
              Apply filters
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Storefront Square payments"
          subtitle={
            summary.count > 0
              ? `Showing ${showingFrom}–${showingTo} of ${summary.count}`
              : 'Shopper checkouts charged to each store’s connected Square account.'
          }
        />
        <CardBody className="overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-6">
              <LoadingPanel label="Loading Square shopper payments..." />
            </div>
          ) : isError ? (
            <div className="p-6">
              <ErrorState
                title="Could not load Square transactions"
                description="Shopper payment report could not be loaded."
                onRetry={() => void refetch()}
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<CreditCard aria-hidden className="size-8" />}
                title="No matching payments"
                description="Try clearing filters, or complete a storefront checkout with Square connected."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Store</TH>
                  <TH>Order</TH>
                  <TH>Customer</TH>
                  <TH>Amount</TH>
                  <TH>Square</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((tx) => (
                  <TR key={tx.orderId}>
                    <TD className="whitespace-nowrap text-sm text-fg-muted">
                      {new Date(tx.createdAt).toLocaleString()}
                    </TD>
                    <TD>
                      <div className="font-medium text-fg">{tx.storeName ?? '—'}</div>
                      {tx.storeSlug && <div className="text-xs text-fg-muted">/{tx.storeSlug}</div>}
                    </TD>
                    <TD className="font-mono text-sm">{tx.reference}</TD>
                    <TD className="max-w-[12rem] truncate text-sm text-fg-muted" title={tx.customerEmail ?? undefined}>
                      {tx.customerEmail ?? '—'}
                    </TD>
                    <TD>{formatPrice(tx.paidCents)}</TD>
                    <TD className="max-w-[14rem]">
                      <div className="truncate font-mono text-xs text-fg-muted" title={tx.paymentReference}>
                        pay:{tx.paymentReference}
                      </div>
                      {tx.squareOrderId && (
                        <div className="truncate font-mono text-xs text-fg-muted" title={tx.squareOrderId}>
                          ord:{tx.squareOrderId}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Badge tone="neutral">{tx.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
        {summary.count > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-sm text-fg-muted">
              <Search aria-hidden className="mr-1 inline size-3.5" />
              Page size {PAGE_SIZE}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={!canPrev} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                Previous
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={!canNext} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
