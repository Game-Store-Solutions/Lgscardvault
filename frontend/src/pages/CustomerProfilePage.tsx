import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { cardImage, formatPrice, formatScryfallPrice } from '../api/client'
import type { CardSummary, SellSubmission, StoreCreditSummary, StoreCustomer } from '../api/types'
import { useAuth } from '../context/AuthContext'
import {
  customerKeys,
  useCustomerFavorites,
  useCustomerNotifications,
  useCustomerOrders,
  useCustomerProfile,
  useCustomerWantList,
  useDebouncedValue,
  useStore,
  useStoreTheme,
} from '../hooks'
import {
  BackButton,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  Spinner,
  TabPanel,
  Textarea,
} from '../components/ui'
import {
  ProfileAsideCard,
  ProfileAsideLink,
  ProfileHero,
  ProfileLayout,
  ProfileSection,
  ProfileSideNav,
  ProfileStatistics,
  storeActivityIcons,
  storeAsideIcons,
} from '../components/profile'
import {
  IconHeartCrystal,
  IconMagicBell,
  IconTreasureChest,
} from '../components/profile/ProfileNavIcons'
import { ImageOff, Plus, ReceiptText, Save, Search, Trash2, WalletCards, X } from 'lucide-react'
import { CustomerOrderCard } from '../components/orders/CustomerOrderCard'
import { NotificationList } from '../components/notifications/NotificationList'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { formatDate } from '../lib/format'

type TabId = 'profile' | 'orders' | 'favorites' | 'wantlist' | 'selltrade' | 'credit' | 'notifications'
const TAB_IDS: TabId[] = ['profile', 'orders', 'favorites', 'wantlist', 'selltrade', 'credit', 'notifications']

export default function CustomerProfilePage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const storeQuery = useStore(slug)
  useStoreTheme(storeQuery.data)
  // The tab lives in the URL (?tab=orders) so other pages — e.g. the cart's
  // "view your order" link — can deep-link straight to a section.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as TabId | null
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'profile'
  const setTab = (next: TabId) => setSearchParams(next === 'profile' ? {} : { tab: next }, { replace: true })

  const favoritesQuery = useCustomerFavorites(slug)
  const wantListQuery = useCustomerWantList(slug)
  const ordersQuery = useCustomerOrders(slug)
  const notificationsQuery = useCustomerNotifications(slug)

  const creditQuery = useQuery({
    queryKey: ['store-credit', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreCreditSummary>(`/stores/${slug}/customer/credit`)
      return data
    },
  })
  const profileQuery = useCustomerProfile(slug)
  const unreadCount = (notificationsQuery.data ?? []).filter((n) => !n.readAt).length
  const favoritesCount = favoritesQuery.data?.length ?? 0
  const wantListCount = wantListQuery.data?.length ?? 0
  const ordersCount = ordersQuery.data?.length ?? 0
  const creditBalance = creditQuery.data?.balanceCents ?? 0
  const store = storeQuery.data

  const navItems = [
    { id: 'profile', label: 'Profile', icon: storeActivityIcons.profile },
    { id: 'orders', label: 'Orders', icon: storeActivityIcons.orders, badge: ordersCount ? <span className="text-xs">{ordersCount}</span> : null },
    { id: 'favorites', label: 'Favorites', icon: storeActivityIcons.favorites, badge: favoritesCount ? <span className="text-xs">{favoritesCount}</span> : null },
    { id: 'wantlist', label: 'Want list', icon: storeActivityIcons.wantlist, badge: wantListCount ? <span className="text-xs">{wantListCount}</span> : null },
    { id: 'selltrade', label: 'Sell / Trade', icon: storeActivityIcons.selltrade },
    {
      id: 'credit',
      label: 'Store credit',
      icon: storeActivityIcons.credit,
      badge: creditBalance > 0 ? <span className="text-xs font-bold">{formatPrice(creditBalance)}</span> : null,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: storeActivityIcons.notifications,
      badge: unreadCount ? <span className="text-xs">{unreadCount}</span> : null,
    },
  ]

  const joinedLabel = profileQuery.data?.createdAt
    ? `Member since ${formatDate(profileQuery.data.createdAt)}`
    : store
      ? `Shopping at ${store.name}`
      : undefined

  return (
    <ProfileLayout
      nav={
        <div className="space-y-3">
          <BackButton to={`/s/${slug}`} tone="soft" className="w-full justify-start">
            Back to store
          </BackButton>
          <ProfileSideNav title="My activity" items={navItems} value={tab} onChange={(id) => setTab(id as TabId)} />
        </div>
      }
      aside={
        <>
          <ProfileAsideCard title="At this store">
            <ProfileAsideLink to={`/s/${slug}`} icon={storeAsideIcons.browse} label="Browse shop" meta={store?.name ?? 'Storefront'} />
            <ProfileAsideLink to={`/s/${slug}/sell`} icon={storeAsideIcons.sellTrade} label="Sell / trade" meta="View buy list" />
            <ProfileAsideLink to={`/s/${slug}/cart`} icon={storeAsideIcons.cart} label="Cart" meta="Checkout" />
          </ProfileAsideCard>
          <ProfileAsideCard title="Account">
            <ProfileAsideLink to="/account" icon={storeAsideIcons.account} label="My account" meta="Profile & settings" />
          </ProfileAsideCard>
          {unreadCount > 0 ? (
            <ProfileAsideCard title="Unread">
              <button
                type="button"
                onClick={() => setTab('notifications')}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-600 hover:bg-bg"
              >
                {unreadCount} notification{unreadCount === 1 ? '' : 's'} →
              </button>
            </ProfileAsideCard>
          ) : null}
        </>
      }
    >
      <ProfileHero
        displayName={user?.displayName ?? 'Signed-in customer'}
        avatarUrl={user?.avatarUrl}
        handle={user?.email}
        joinedLabel={joinedLabel}
        coverStyle={
          store?.primaryColor
            ? {
                background: `linear-gradient(180deg, color-mix(in srgb, ${store.primaryColor} 28%, transparent) 0%, color-mix(in srgb, ${store.primaryColor} 8%, transparent) 100%)`,
              }
            : undefined
        }
        badge={
          store?.logoUrl ? (
            <img src={store.logoUrl} alt="" className="size-10 rounded-full border-2 border-surface object-cover shadow-sm" />
          ) : null
        }
        footer={
          store ? (
            <Link
              to={`/s/${slug}`}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm hover:bg-bg"
            >
              Visit {store.name}
            </Link>
          ) : null
        }
      />

      {tab === 'profile' ? (
        <ProfileSection title="Statistics">
          <ProfileStatistics
            stats={[
              { id: 'orders', label: 'Orders', value: ordersCount, icon: storeActivityIcons.orders, iconClassName: '' },
              { id: 'favorites', label: 'Favorites', value: favoritesCount, icon: storeActivityIcons.favorites, iconClassName: '' },
              { id: 'want', label: 'Want list', value: wantListCount, icon: storeActivityIcons.wantlist, iconClassName: '' },
              {
                id: 'credit',
                label: 'Store credit',
                value: formatPrice(creditBalance),
                icon: storeActivityIcons.credit,
                iconClassName: '',
              },
            ]}
          />
        </ProfileSection>
      ) : null}

      <TabPanel when="profile" value={tab}>
        <ProfilePanel slug={slug} />
        <Card className="mt-6 rounded-2xl">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              Your name, profile image, and password are platform-wide — manage them once for every store.
            </p>
            <Link to="/account" className="text-sm font-bold text-brand-600 hover:underline">
              Account settings →
            </Link>
          </CardBody>
        </Card>
      </TabPanel>
      <TabPanel when="orders" value={tab}>
        <OrdersPanel slug={slug} query={ordersQuery} />
      </TabPanel>
      <TabPanel when="favorites" value={tab}>
        <FavoritesPanel slug={slug} query={favoritesQuery} />
      </TabPanel>
      <TabPanel when="wantlist" value={tab}>
        <WantListPanel slug={slug} query={wantListQuery} />
      </TabPanel>
      <TabPanel when="selltrade" value={tab}>
        <SellTradeHistoryPanel slug={slug} />
      </TabPanel>
      <TabPanel when="credit" value={tab}>
        <StoreCreditPanel slug={slug} query={creditQuery} storeName={store?.name ?? 'this store'} />
      </TabPanel>
      <TabPanel when="notifications" value={tab}>
        <NotificationsTabPanel slug={slug} query={notificationsQuery} />
      </TabPanel>
    </ProfileLayout>
  )
}

/* --------------------------- Sell/Trade history --------------------------- */

const SELL_STATUS_TONE: Record<SellSubmission['status'], 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

function SellTradeHistoryPanel({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ['my-sell-submissions', slug] as const,
    queryFn: async () => {
      const { data } = await api.get<SellSubmission[]>(`/stores/${slug}/customer/sell-submissions`)
      return data
    },
  })

  if (query.isLoading) return <LoadingPanel label="Loading your sell/trade history…" />
  if (query.isError) return <ErrorState title="Could not load your sell/trade history." onRetry={() => void query.refetch()} />

  const submissions = query.data ?? []
  if (submissions.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={WalletCards}
            title="No sell/trade submissions yet"
            description="Cards you offer to sell to this store will show up here."
            action={
              <Link to={`/s/${slug}/sell`} className="text-sm font-bold text-brand-600 hover:underline">
                Browse the buy list →
              </Link>
            }
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {submissions.map((submission) => (
        <Card key={submission.id}>
          <CardHeader
            title={`${submission.items.reduce((n, item) => n + (item.acceptedQuantity ?? item.quantity), 0)} cards · store pays ${formatPrice(submission.totalOfferCents)} in ${submission.payoutMethod === 'credit' ? 'store credit' : 'cash'}`}
            subtitle={new Date(submission.createdAt).toLocaleString()}
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
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

/** Full notification history: unread up top with mark-read, earlier ones dimmed. */
function NotificationsTabPanel({
  slug,
  query,
}: {
  slug: string
  query: ReturnType<typeof useCustomerNotifications>
}) {
  const queryClient = useQueryClient()
  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/stores/${slug}/customer/notifications/${id}/read`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.notifications(slug) }),
  })

  if (query.isLoading) return <LoadingPanel label="Loading notifications…" />
  const all = query.data ?? []
  if (all.length === 0) {
    return (
      <Card className="mt-6">
        <CardBody>
          <EmptyState
            icon={IconMagicBell}
            title="No notifications yet"
            description="Order updates and want-list matches from this store will show up here."
          />
        </CardBody>
      </Card>
    )
  }

  const unread = all.filter((n) => !n.readAt)
  const read = all.filter((n) => n.readAt)

  return (
    <div className="mt-6 space-y-6">
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
                  <p className="mt-0.5 text-xs text-fg-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/** Store credit: live balance plus the full ledger, newest first. */
function StoreCreditPanel({
  slug,
  query,
  storeName,
}: {
  slug: string
  query: { data?: StoreCreditSummary; isLoading: boolean }
  storeName: string
}) {
  if (query.isLoading) return <LoadingPanel label="Loading your store credit…" />
  const balance = query.data?.balanceCents ?? 0
  const transactions = query.data?.transactions ?? []

  const kindLabel = (kind: string) =>
    kind === 'sell_submission' ? 'Sell/trade payout' : kind === 'order' ? 'Order' : 'Store adjustment'

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-rose-100 text-rose-500">
              <IconTreasureChest className="size-6" />
            </span>
            <div>
              <p className="text-sm text-fg-muted">Your credit at {storeName}</p>
              <p className="font-display text-3xl font-extrabold text-fg">{formatPrice(balance)}</p>
            </div>
          </div>
          <Link to={`/s/${slug}`} className="text-sm font-bold text-brand-600 hover:underline">
            Spend it in the shop →
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="History" subtitle="Sell/trade payouts add credit; checkout spends it; refunds bring it back." />
        <CardBody>
          {transactions.length === 0 ? (
            <EmptyState
              icon={IconTreasureChest}
              title="No credit yet"
              description="Choose the store-credit payout when you sell cards and your balance will grow here."
              action={
                <Link to={`/s/${slug}/sell`} className="text-sm font-bold text-brand-600 hover:underline">
                  Sell or trade cards →
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {transactions.map((transaction) => (
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
        </CardBody>
      </Card>
    </div>
  )
}

/* ------------------------------ Profile ------------------------------ */

const profileSchema = z.object({
  phone: z.string().max(255),
  shippingAddress: z.string(),
})

type ProfileForm = z.infer<typeof profileSchema>

const EMPTY_PROFILE: ProfileForm = {
  phone: '',
  shippingAddress: '',
}

/**
 * Store-agnostic account settings: profile image + display name, password
 * change, and account deletion. Operates on /api/me (the signed-in user),
 * unlike the per-store contact/payment profile above it.
 */
function ProfilePanel({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const profileQuery = useCustomerProfile(slug)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: EMPTY_PROFILE,
  })

  useEffect(() => {
    const data = profileQuery.data
    if (!data) return
    reset({
      phone: data.phone ?? '',
      shippingAddress: data.shippingAddress ?? '',
    })
  }, [profileQuery.data, reset])

  const mutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const { data } = await api.patch<StoreCustomer>(`/stores/${slug}/customer`, values)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(customerKeys.profile(slug), data)
      reset({
        phone: data.phone ?? '',
        shippingAddress: data.shippingAddress ?? '',
      })
      setSaved(true)
    },
  })

  if (profileQuery.isLoading) return <StorePageLoader label="Loading your profile…" />
  if (profileQuery.isError) {
    return <ErrorState title="Could not load your profile." onRetry={() => void profileQuery.refetch()} />
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleSubmit((values) => {
          setSaved(false)
          mutation.mutate(values)
        })}
        className="contents"
      >
        <Card>
          <CardHeader title="Contact &amp; shipping" subtitle="How this store reaches you for orders." />
          <CardBody className="space-y-4">
            <Input label="Phone" placeholder="(555) 123-4567" error={errors.phone?.message} {...register('phone')} />
            <Textarea
              label="Shipping address"
              placeholder="Street, city, state, ZIP"
              rows={4}
              error={errors.shippingAddress?.message}
              {...register('shippingAddress')}
            />
            <div className="flex items-center gap-4 pt-1">
              <Button type="submit" loading={mutation.isPending} disabled={!isDirty && !mutation.isPending}>
                <Save aria-hidden className="size-4" />
                Save changes
              </Button>
              {saved && !isDirty && (
                <span role="status" className="text-sm font-medium text-success-700">
                  Profile saved.
                </span>
              )}
              {mutation.isError && (
                <span role="alert" className="text-sm font-medium text-danger-700">
                  Could not save your profile. Please try again.
                </span>
              )}
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  )
}

/* ------------------------------ Orders ------------------------------ */

function OrdersPanel({
  slug,
  query,
}: {
  slug: string
  query: ReturnType<typeof useCustomerOrders>
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  if (query.isLoading) return <LoadingPanel label="Loading orders..." />
  if (query.isError) return <ErrorState title="Could not load orders." onRetry={() => void query.refetch()} />

  const orders = query.data ?? []
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No past orders yet"
        description="Orders you place with this store will appear here."
        action={
          <Link to={`/s/${slug}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Browse the store
          </Link>
        }
      />
    )
  }

  return (
    <Card>
      <CardHeader title="Past orders" subtitle="Track order status and review previous purchases." />
      <CardBody className="grid gap-3 bg-bg/40">
        {orders.map((order) => (
          <CustomerOrderCard
            key={order.id}
            order={order}
            expanded={expandedId === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
          />
        ))}
      </CardBody>
    </Card>
  )
}

/* ------------------------------ Favorites ------------------------------ */

function FavoritesPanel({
  slug,
  query,
}: {
  slug: string
  query: ReturnType<typeof useCustomerFavorites>
}) {
  const queryClient = useQueryClient()

  const removeMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await api.delete(`/stores/${slug}/customer/favorites/${itemId}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.favorites(slug) }),
  })

  if (query.isLoading) return <LoadingPanel label="Loading favorites…" />
  if (query.isError) return <ErrorState title="Could not load favorites." onRetry={() => void query.refetch()} />

  const favorites = query.data ?? []
  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={IconHeartCrystal}
        title="No favorites yet"
        description="Save cards you love from this store and they'll show up here."
        action={
          <Link to={`/s/${slug}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Browse the store
          </Link>
        }
      />
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {favorites.map((favorite) => (
        <div key={favorite.id} className="space-y-2">
          <Link
            to={`/s/${slug}/cards/${favorite.inventoryItem.id}`}
            className="group flex gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand-300"
          >
            <div className="grid h-28 w-20 flex-shrink-0 place-items-center rounded-card border border-border bg-bg">
              {cardImage(favorite.inventoryItem.card) ? (
                <img
                  src={cardImage(favorite.inventoryItem.card)}
                  alt={favorite.inventoryItem.card.name}
                  className="max-h-24 rounded-btn"
                />
              ) : (
                <ImageOff aria-hidden className="size-5 text-fg-muted" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 font-bold leading-snug text-brand-600">
                {favorite.inventoryItem.card.name}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{favorite.inventoryItem.condition}</Badge>
                <Badge tone={favorite.inventoryItem.isFoil ? 'brand' : 'neutral'}>
                  {favorite.inventoryItem.finish}
                </Badge>
              </div>
              <p className="mt-2 text-lg font-bold text-fg">
                {formatScryfallPrice(
                  favorite.inventoryItem.card,
                  favorite.inventoryItem.isFoil ? 'foil' : 'nonfoil',
                )}
              </p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-700"
            loading={removeMutation.isPending && removeMutation.variables === favorite.inventoryItem.id}
            onClick={() => removeMutation.mutate(favorite.inventoryItem.id)}
          >
            <Trash2 aria-hidden className="size-4" />
            Remove
          </Button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ Want list ------------------------------ */

function WantListPanel({
  slug,
  query,
}: {
  slug: string
  query: ReturnType<typeof useCustomerWantList>
}) {
  const queryClient = useQueryClient()

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/stores/${slug}/customer/want-list/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) }),
  })

  const entries = query.data ?? []

  return (
    <ProfileSection title="Want list">
      <WantListAddForm slug={slug} />

      {query.isLoading ? (
        <LoadingPanel label="Loading want list…" />
      ) : query.isError ? (
        <ErrorState title="Could not load your want list." onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        <p className="rounded-2xl bg-bg/80 px-4 py-8 text-center text-sm text-fg-muted">
          Nothing on your list yet — search above to tell the store what you&apos;re looking for.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border/80">
          {entries.map((entry) => {
            const detailHref = entry.inventoryItemId ? `/s/${slug}/cards/${entry.inventoryItemId}` : null
            const main = (
              <>
                <div className="grid h-[4.25rem] w-[3.1rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-bg ring-1 ring-border/60">
                  {entry.card && cardImage(entry.card) ? (
                    <img src={cardImage(entry.card)} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageOff aria-hidden className="size-5 text-fg-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-fg group-hover:text-brand-600">{entry.cardName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                    {entry.setCode ? <Badge>{entry.setCode.toUpperCase()}</Badge> : null}
                    <Badge tone={entry.isFoil ? 'brand' : 'neutral'}>{entry.finish}</Badge>
                    <span className="font-medium">Qty {entry.quantity}</span>
                  </div>
                  {entry.notes ? <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{entry.notes}</p> : null}
                  {detailHref ? (
                    <p className="mt-1 text-xs font-semibold text-brand-600">View in store →</p>
                  ) : (
                    <p className="mt-1 text-xs text-fg-muted">Not listed at this store yet</p>
                  )}
                </div>
              </>
            )

            return (
              <li key={entry.id} className="border-b border-border/70 last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                  {detailHref ? (
                    <Link
                      to={detailHref}
                      className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5 transition-colors hover:bg-bg/60 sm:gap-4"
                    >
                      {main}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">{main}</div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-fg-muted hover:text-danger-700"
                    loading={removeMutation.isPending && removeMutation.variables === entry.id}
                    onClick={() => removeMutation.mutate(entry.id)}
                    aria-label={`Remove ${entry.cardName} from want list`}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ProfileSection>
  )
}

function WantListAddForm({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<CardSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [isFoil, setIsFoil] = useState(false)
  const [notes, setNotes] = useState('')
  const boxRef = useRef<HTMLDivElement | null>(null)

  const debouncedTerm = useDebouncedValue(term.trim(), 250)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const searchQuery = useQuery({
    queryKey: ['catalog-search', debouncedTerm],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', { params: { q: debouncedTerm } })
      return data
    },
    enabled: debouncedTerm.length >= 2 && !selected,
  })

  const results = searchQuery.data ?? []
  const cardName = (selected?.name ?? term).trim()

  const addMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/customer/want-list`, {
        cardId: selected?.id,
        cardName,
        setCode: selected?.setCode ?? '',
        isFoil,
        quantity,
        notes,
      })
    },
    onSuccess: () => {
      setTerm('')
      setSelected(null)
      setQuantity(1)
      setIsFoil(false)
      setNotes('')
      void queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) })
    },
  })

  function pickCard(card: CardSummary) {
    setSelected(card)
    setTerm(card.name)
    setOpen(false)
  }

  function clearSelection() {
    setSelected(null)
    setTerm('')
    setOpen(false)
  }

  return (
    <div className="mb-5 rounded-2xl bg-bg/70 p-4 ring-1 ring-border/70 sm:p-5">
      <p className="text-sm font-bold text-fg">Add a card</p>
      <p className="mt-0.5 text-xs text-fg-muted">Search the catalog so the store knows the exact printing.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (cardName.length > 0) addMutation.mutate()
        }}
        className="mt-4 space-y-3"
      >
        <div ref={boxRef} className="relative">
          <label htmlFor="wantlist-card-search" className="sr-only">
            Search for a card
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              id="wantlist-card-search"
              type="text"
              autoComplete="off"
              value={term}
              placeholder="Search cards (e.g. Sol Ring)"
              onChange={(event) => {
                setTerm(event.target.value)
                if (selected) setSelected(null)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              className="w-full rounded-xl border-0 bg-surface py-2.5 pl-9 pr-9 text-sm text-fg shadow-sm ring-1 ring-border/80 outline-none focus:ring-2 focus:ring-brand-500/35"
            />
            {searchQuery.isFetching && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
            {!searchQuery.isFetching && term ? (
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fg-muted hover:bg-bg"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>

          {open && !selected && debouncedTerm.length >= 2 ? (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-border/80">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-fg-muted">
                  {searchQuery.isFetching ? 'Searching…' : 'No matching cards.'}
                </p>
              ) : (
                results.map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    onClick={() => pickCard(card)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-bg"
                  >
                    <span className="grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded bg-bg ring-1 ring-border/60">
                      {cardImage(card) ? (
                        <img src={cardImage(card)} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageOff aria-hidden className="size-4 text-fg-muted" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{card.name}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {(card.setCode ?? '—').toUpperCase()} · {card.rarity ?? 'unknown'}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {selected ? (
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-border/70">
            <Badge tone="brand">{selected.setCode?.toUpperCase() ?? '—'}</Badge>
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{selected.name}</span>
            <button type="button" onClick={clearSelection} aria-label="Remove selected card" className="text-fg-muted hover:text-fg">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[5rem_1fr_auto] sm:items-end">
          <Input
            label="Qty"
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          />
          <label className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm text-fg ring-1 ring-border/70 sm:mb-0 sm:mt-6">
            <input
              type="checkbox"
              className="size-4 rounded border-border accent-brand-500"
              checked={isFoil}
              onChange={(event) => setIsFoil(event.target.checked)}
            />
            Foil
          </label>
          <Button
            type="submit"
            loading={addMutation.isPending}
            disabled={cardName.length === 0}
            className="sm:mt-6"
          >
            <Plus aria-hidden className="size-4" />
            Add
          </Button>
        </div>

        <Textarea
          label="Notes (optional)"
          rows={2}
          placeholder="Condition, budget, language…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {addMutation.isError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            Could not add to your want list. Please try again.
          </p>
        ) : null}
      </form>
    </div>
  )
}
