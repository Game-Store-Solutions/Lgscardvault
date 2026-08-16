import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Heart, ImageOff, Trash2, Wallet, WalletCards } from 'lucide-react'
import api, { ACCOUNT_PAGE_SIZE, cardImage, formatPrice, formatScryfallPrice } from '../../api/client'
import type { CustomerFavorite, CustomerNotification, PaginatedList, SellSubmission, StoreCreditBalance, StoreCreditSummary, StoreCreditTransaction } from '../../api/types'
import { customerKeys, useMarkAllNotificationsRead, useMarkNotificationRead, useMyFavorites, useMyNotifications, useMySellSubmissions } from '../../hooks'
import { NotificationList } from '../notifications/NotificationList'
import { Badge, Button, buttonVariants, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingPanel, Pagination, Select } from '../ui'
import { cx } from '../../lib/cx'

function pageCount(total: number, pageSize = ACCOUNT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize))
}

function creditTransactions(data?: StoreCreditSummary | null): PaginatedList<StoreCreditTransaction> {
  const rows = data?.transactions
  if (Array.isArray(rows)) {
    return { items: rows, total: rows.length, page: 1, itemsPerPage: rows.length || ACCOUNT_PAGE_SIZE }
  }
  return rows ?? { items: [], total: 0, page: 1, itemsPerPage: ACCOUNT_PAGE_SIZE }
}

const SELL_STATUS_TONE: Record<SellSubmission['status'], 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

export function FavoritesPanel({ storeSlug }: { storeSlug?: string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useMyFavorites(page, storeSlug)

  useEffect(() => {
    setPage(1)
  }, [storeSlug])

  const removeMutation = useMutation({
    mutationFn: async (favorite: CustomerFavorite) => {
      const slug = favorite.storeSlug
      if (!slug) throw new Error('Missing store')
      await api.delete(`/stores/${slug}/customer/favorites/${favorite.inventoryItem.id}`)
      return slug
    },
    onSuccess: (slug) => {
      void queryClient.invalidateQueries({ queryKey: ['my-favorites'] })
      void queryClient.invalidateQueries({ queryKey: customerKeys.favorites(slug) })
    },
  })

  if (query.isLoading) return <LoadingPanel label="Loading favorites…" />
  if (query.isError) return <ErrorState title="Could not load favorites." onRetry={() => void query.refetch()} />

  const favorites = query.data?.items ?? []
  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No favorites yet"
        description="Save cards you love from any storefront and they will show up here."
        action={
          <Link to="/stores" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Browse stores
          </Link>
        }
      />
    )
  }

  return (
    <div className="grid gap-3">
      {favorites.map((favorite) => {
        const item = favorite.inventoryItem
        const slug = favorite.storeSlug
        const href = slug ? `/s/${slug}/cards/${item.id}` : undefined
        return (
          <div
            key={`${slug ?? 'store'}-${favorite.id}`}
            className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-border/80"
          >
            <Link to={href ?? '/stores'} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid h-[4.25rem] w-[3.1rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-bg ring-1 ring-border/60">
                {cardImage(item.card) ? (
                  <img src={cardImage(item.card)} alt="" className="size-full object-cover" />
                ) : (
                  <ImageOff aria-hidden className="size-5 text-fg-muted" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-fg">{item.card.name}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {favorite.storeName ? `${favorite.storeName} · ` : ''}
                  {formatPrice(item.priceCents)}
                  {' · market '}
                  {formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')}
                </p>
              </div>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-700"
              loading={removeMutation.isPending && removeMutation.variables?.id === favorite.id}
              onClick={() => removeMutation.mutate(favorite)}
            >
              <Trash2 aria-hidden className="size-4" />
              Remove
            </Button>
          </div>
        )
      })}
      <Pagination
        page={page}
        pageCount={pageCount(query.data?.total ?? 0)}
        onPageChange={setPage}
        totalItems={query.data?.total}
      />
    </div>
  )
}

export function SellTradeHistoryPanel({
  storeSlug,
  onClearStoreFilter,
}: {
  storeSlug?: string
  onClearStoreFilter?: () => void
}) {
  const [page, setPage] = useState(1)
  const query = useMySellSubmissions(page, storeSlug)
  const allQuery = useMySellSubmissions(1, undefined, Boolean(storeSlug))

  useEffect(() => {
    setPage(1)
  }, [storeSlug])

  if (query.isLoading) return <LoadingPanel label="Loading your sell/trade history…" />
  if (query.isError) return <ErrorState title="Could not load your sell/trade history." onRetry={() => void query.refetch()} />

  const submissions = query.data?.items ?? []
  const otherStoreCount = Math.max(0, (allQuery.data?.total ?? 0) - (query.data?.total ?? 0))
  if (submissions.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={WalletCards}
            title="No sell/trade submissions yet"
            description={
              storeSlug && otherStoreCount > 0
                ? `No sell/trades at this store. You have ${otherStoreCount} at other stores.`
                : 'Cards you offer to sell at any store will show up here.'
            }
            action={
              storeSlug && otherStoreCount > 0 && onClearStoreFilter ? (
                <button type="button" onClick={onClearStoreFilter} className="text-sm font-bold text-brand-600 hover:underline">
                  View all sell/trades
                </button>
              ) : (
                <Link to="/stores" className="text-sm font-bold text-brand-600 hover:underline">
                  Find a store →
                </Link>
              )
            }
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {storeSlug && otherStoreCount > 0 && onClearStoreFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <p className="text-fg-muted">
            Showing this store only. {otherStoreCount} more sell/trade
            {otherStoreCount === 1 ? '' : 's'} at other stores.
          </p>
          <button type="button" onClick={onClearStoreFilter} className="font-bold text-brand-600 hover:underline">
            View all
          </button>
        </div>
      ) : null}
      {submissions.map((submission) => (
        <Card key={`${submission.storeSlug ?? 'store'}-${submission.id}`}>
          <CardHeader
            title={`${submission.items.reduce((n, item) => n + (item.acceptedQuantity ?? item.quantity), 0)} cards · store pays ${formatPrice(submission.totalOfferCents)} in ${submission.payoutMethod === 'credit' ? 'store credit' : 'cash'}`}
            subtitle={`${submission.storeName ? `${submission.storeName} · ` : ''}${new Date(submission.createdAt).toLocaleString()}`}
            actions={<Badge tone={SELL_STATUS_TONE[submission.status]} className="uppercase">{submission.status}</Badge>}
          />
          <CardBody>
            <ul className="space-y-1 text-sm">
              {submission.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-fg">
                    {item.quantity}× {item.cardName}
                    {item.isFoil ? ` (${item.finish})` : ''}
                  </span>
                  <span className="shrink-0 text-fg-muted">{formatPrice(item.offerCentsEach)} each</span>
                </li>
              ))}
            </ul>
            {submission.storeSlug ? (
              <Link to={`/s/${submission.storeSlug}/sell`} className="mt-3 inline-block text-sm font-bold text-brand-600 hover:underline">
                Open this store’s buy list →
              </Link>
            ) : null}
          </CardBody>
        </Card>
      ))}
      <Pagination
        page={page}
        pageCount={pageCount(query.data?.total ?? 0)}
        onPageChange={setPage}
        totalItems={query.data?.total}
      />
    </div>
  )
}

export function StoreCreditPanel({
  storeSlug,
  onSelectStore,
}: {
  storeSlug?: string
  onSelectStore?: (slug: string) => void
}) {
  const [balancePage, setBalancePage] = useState(1)
  const [ledgerPage, setLedgerPage] = useState(1)
  const balancesQuery = useQuery({
    queryKey: customerKeys.myCredit(1),
    queryFn: async () => {
      const { data } = await api.get<{ balances: StoreCreditBalance[] }>('/me/credit')
      return data.balances ?? []
    },
  })
  const ledgerQuery = useQuery({
    queryKey: customerKeys.myCredit(ledgerPage, storeSlug),
    queryFn: async () => {
      const { data } = await api.get<StoreCreditSummary>('/me/credit', {
        params: { store: storeSlug, page: ledgerPage, itemsPerPage: ACCOUNT_PAGE_SIZE },
      })
      return data
    },
    enabled: Boolean(storeSlug),
    placeholderData: (previous) => previous,
  })

  useEffect(() => {
    setBalancePage(1)
    setLedgerPage(1)
  }, [storeSlug])

  if (balancesQuery.isLoading) return <LoadingPanel label="Loading your store credit…" />

  const kindLabel = (kind: string) =>
    kind === 'sell_submission' ? 'Sell/trade payout' : kind === 'order' ? 'Order' : 'Store adjustment'

  const balances = balancesQuery.data ?? []
  const totalCents = balances.reduce((sum, row) => sum + row.balanceCents, 0)
  const selected = storeSlug ? balances.find((row) => row.storeSlug === storeSlug) : undefined

  if (balances.length === 0 && !storeSlug) {
    return (
      <EmptyState
        icon={Wallet}
        title="No store credit yet"
        description="Credit you earn at a store stays at that store. Sell cards for credit, then spend it at checkout."
      />
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-bg text-fg-muted">
              <Wallet className="size-6" />
            </span>
            <div>
              <p className="text-sm text-fg-muted">
                {storeSlug
                  ? `Credit at ${selected?.storeName ?? ledgerQuery.data?.storeName ?? 'this store'}`
                  : `Credit across ${balances.length} store${balances.length === 1 ? '' : 's'}`}
              </p>
              <p className="font-display text-3xl font-extrabold text-fg">
                {formatPrice(storeSlug ? (ledgerQuery.data?.balanceCents ?? selected?.balanceCents ?? 0) : totalCents)}
              </p>
            </div>
          </div>
          {storeSlug && (
            <Link to={`/s/${storeSlug}`} className="text-sm font-bold text-brand-600 hover:underline">
              Spend it in the shop →
            </Link>
          )}
        </CardBody>
      </Card>

      {balances.length > 0 && (
        <Card>
          <CardHeader
            title="By store"
            subtitle="Each balance can only be spent at the store that issued it."
          />
          <CardBody className="space-y-2">
            {balances.slice((balancePage - 1) * ACCOUNT_PAGE_SIZE, balancePage * ACCOUNT_PAGE_SIZE).map((row) => {
              const active = storeSlug === row.storeSlug
              return (
                <div
                  key={row.storeSlug}
                  className={cx(
                    'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3',
                    active ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-500/10' : 'border-border bg-bg/50',
                  )}
                >
                  <div>
                    <p className="font-bold text-fg">{row.storeName}</p>
                    <p className="font-display text-xl font-extrabold text-fg">{formatPrice(row.balanceCents)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onSelectStore && (
                      <Button
                        size="sm"
                        variant={active ? 'primary' : 'secondary'}
                        onClick={() => onSelectStore(active ? '' : row.storeSlug)}
                      >
                        {active ? 'All stores' : 'View history'}
                      </Button>
                    )}
                    <Link to={`/s/${row.storeSlug}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                      Shop
                    </Link>
                  </div>
                </div>
              )
            })}
            <Pagination
              page={balancePage}
              pageCount={pageCount(balances.length)}
              onPageChange={setBalancePage}
              totalItems={balances.length}
            />
          </CardBody>
        </Card>
      )}

      {storeSlug && (
        <Card>
          <CardHeader title="History" subtitle="Sell/trade payouts add credit; checkout spends it; refunds bring it back." />
          <CardBody>
            {ledgerQuery.isLoading ? (
              <LoadingPanel label="Loading this store's ledger…" />
            ) : creditTransactions(ledgerQuery.data).total === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No movements yet"
                description="Choose the store-credit payout when you sell cards and your balance will grow here."
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {creditTransactions(ledgerQuery.data).items.map((transaction) => (
                  <li key={transaction.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-bold text-fg">
                        {kindLabel(transaction.kind)}
                        {transaction.orderReference ? ` · ${transaction.orderReference}` : ''}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {new Date(transaction.createdAt).toLocaleString()}
                        {transaction.note ? ` · ${transaction.note}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 font-display text-base font-bold ${transaction.amountCents >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                      {transaction.amountCents >= 0 ? '+' : '−'}
                      {formatPrice(Math.abs(transaction.amountCents))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              className="mt-3"
              page={ledgerPage}
              pageCount={pageCount(creditTransactions(ledgerQuery.data).total)}
              onPageChange={setLedgerPage}
              totalItems={creditTransactions(ledgerQuery.data).total}
            />
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export function NotificationsPanel({ storeSlug }: { storeSlug?: string }) {
  const [page, setPage] = useState(1)
  const query = useMyNotifications(page, storeSlug)
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead(storeSlug)
  const all = query.data?.items ?? []
  const unread = all.filter((n: CustomerNotification) => !n.readAt)
  const read = all.filter((n: CustomerNotification) => n.readAt)

  useEffect(() => {
    setPage(1)
  }, [storeSlug])

  useEffect(() => {
    if (!query.isSuccess || unread.length === 0 || markAllRead.isPending) return
    markAllRead.mutate()
    // Mark-all clears the profile badge as soon as this section is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate on first unread batch only
  }, [query.isSuccess, unread.length, storeSlug])

  if (query.isLoading) return <LoadingPanel label="Loading notifications…" />
  if (all.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="Order updates, sell/trade completions, and want-list matches from every store will show up here."
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {unread.length > 0 && (
        <Card>
          <CardHeader title={`Unread (${unread.length})`} />
          <CardBody>
            <NotificationList notifications={unread} pendingId={markRead.variables} onMarkRead={(id) => markRead.mutate(id)} />
          </CardBody>
        </Card>
      )}
      {read.length > 0 && (
        <Card>
          <CardHeader title="Earlier" />
          <CardBody>
            <ul className="space-y-2">
              {read.map((notification) => (
                <li key={notification.id} className="rounded-btn border border-border bg-bg px-3 py-2 opacity-80">
                  <p className="truncate text-sm font-bold text-fg">{notification.title}</p>
                  <p className="text-xs text-fg-muted">{notification.body}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {notification.storeName ? `${notification.storeName} · ` : ''}
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <Pagination
        page={page}
        pageCount={pageCount(query.data?.total ?? 0)}
        onPageChange={setPage}
        totalItems={query.data?.total}
      />
    </div>
  )
}

export function StoreFilterSelect({
  stores,
  value,
  onChange,
}: {
  stores: { slug: string; name: string }[]
  value?: string
  onChange: (slug: string) => void
}) {
  return (
    <Select
      label="Filter by store"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      wrapperClassName="w-full"
      className="w-full min-w-0"
    >
      <option value="">All stores</option>
      {stores.map((store) => (
        <option key={store.slug} value={store.slug}>
          {store.name}
        </option>
      ))}
    </Select>
  )
}
