import { useEffect, useState, type ReactNode } from 'react'
import { ReceiptText } from 'lucide-react'
import type { PaginatedOrders } from '../../api/types'
import { CustomerOrderCard } from './CustomerOrderCard'
import { Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingPanel, Pagination } from '../ui'
import { ProfilePanelCard } from '../profile'
import type { UseQueryResult } from '@tanstack/react-query'

type OrdersQuery = UseQueryResult<PaginatedOrders>

export function PaginatedCustomerOrdersList({
  query,
  page,
  onPageChange,
  compact = false,
  emptyTitle = 'No orders yet',
  emptyDescription,
  emptyAction,
  headerTitle,
  headerSubtitle,
  wrapInCard = false,
}: {
  query: OrdersQuery
  page: number
  onPageChange: (page: number) => void
  compact?: boolean
  emptyTitle?: string
  emptyDescription: string
  emptyAction?: ReactNode
  headerTitle: string
  headerSubtitle?: string
  wrapInCard?: boolean
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    setExpandedId(null)
  }, [page])

  if (query.isLoading && !query.data) {
    return <LoadingPanel label="Loading orders…" />
  }
  if (query.isError) {
    return <ErrorState title="Could not load orders." onRetry={() => void query.refetch()} />
  }

  const payload = query.data
  const orders = payload?.items ?? []
  const total = payload?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / (payload?.itemsPerPage ?? 15)))

  if (total === 0) {
    return (
      <EmptyState icon={ReceiptText} title={emptyTitle} description={emptyDescription} action={emptyAction} />
    )
  }

  const list = (
    <>
      <ul className={compact ? 'divide-y divide-border' : 'grid gap-3'}>
        {orders.map((order) => (
          <li key={order.id} className={compact ? undefined : ''}>
            <CustomerOrderCard
              order={order}
              compact={compact}
              expanded={expandedId === order.id}
              onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
            />
          </li>
        ))}
      </ul>
      <Pagination
        className="mt-4"
        page={page}
        pageCount={pageCount}
        totalItems={total}
        onPageChange={onPageChange}
      />
    </>
  )

  if (wrapInCard) {
    return (
      <Card>
        <CardHeader title={headerTitle} subtitle={headerSubtitle} />
        <CardBody>{list}</CardBody>
      </Card>
    )
  }

  return (
    <ProfilePanelCard>
      <CardHeader title={headerTitle} subtitle={headerSubtitle} />
      <CardBody className={compact ? 'p-0' : undefined}>{list}</CardBody>
    </ProfilePanelCard>
  )
}
