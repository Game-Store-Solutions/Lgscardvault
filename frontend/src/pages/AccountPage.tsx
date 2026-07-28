import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Store as StoreIcon } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { AccountSettingsPanel } from '../components/account/AccountSettingsPanel'
import { Avatar, Card, CardBody, CardHeader, EmptyState, LoadingPanel, PageHeader } from '../components/ui'
import { formatDate } from '../lib/format'

interface MyStore {
  id: number
  name: string
  slug: string
  logoUrl: string | null
  orderCount: number
  submissionCount: number
  lastActivityAt: string
}

/**
 * Global account page: one identity across the whole marketplace. The
 * name/avatar/password/deletion settings live here; per-store activity
 * (orders, favorites, want lists, sell/trade) stays on each store's
 * account page, linked from the "your stores" list below.
 */
export default function AccountPage() {
  const { user } = useAuth()

  const storesQuery = useQuery({
    queryKey: ['my-stores'],
    queryFn: async () => {
      const { data } = await api.get<MyStore[]>('/me/stores')
      return data
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle="One account for every store on the marketplace." />

      <Card>
        <CardBody className="flex items-center gap-4">
          <Avatar name={user?.displayName ?? '?'} src={user?.avatarUrl ?? undefined} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-bold text-fg">{user?.displayName}</p>
            <p className="truncate text-sm text-fg-muted">{user?.email}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Your stores"
          subtitle="Everywhere you've shopped, saved cards, or sold — your orders and lists live on each store's page."
        />
        <CardBody>
          {storesQuery.isLoading ? (
            <LoadingPanel />
          ) : (storesQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={StoreIcon}
              title="No store activity yet"
              description="Browse the marketplace and your stores will show up here."
              action={
                <Link to="/" className="text-sm font-bold text-brand-600 hover:underline">
                  Find a store →
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {storesQuery.data!.map((store) => (
                <li key={store.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
                  {store.logoUrl ? (
                    <img src={store.logoUrl} alt="" className="size-11 shrink-0 rounded-btn object-cover" />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600">
                      <StoreIcon aria-hidden className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-fg">{store.name}</p>
                    <p className="text-xs text-fg-muted">
                      {store.orderCount} order{store.orderCount === 1 ? '' : 's'}
                      {store.submissionCount > 0
                        ? ` · ${store.submissionCount} sell/trade submission${store.submissionCount === 1 ? '' : 's'}`
                        : ''}
                      {' · last activity '}
                      {formatDate(store.lastActivityAt)}
                    </p>
                  </div>
                  <Link to={`/s/${store.slug}`} className="text-sm font-medium text-brand-600 hover:underline">
                    Shop
                  </Link>
                  <Link
                    to={`/s/${store.slug}/account`}
                    className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline"
                  >
                    My activity
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <AccountSettingsPanel />
    </div>
  )
}
