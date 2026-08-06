import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { cardImage, formatPrice, formatScryfallPrice, httpStatus } from '../api/client'
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
  Avatar,
  BackButton,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingPanel,
  PageHeader,
  Spinner,
  Tabs,
  TabPanel,
  Textarea,
} from '../components/ui'
import { BellRing, HandCoins, Heart, ImageOff, ListPlus, PackageOpen, PiggyBank, Plus, ReceiptText, Save, Search, Smile, Sparkles, Trash2, WalletCards, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CustomerOrderCard } from '../components/orders/CustomerOrderCard'
import { NotificationList } from '../components/notifications/NotificationList'
import { StorePageLoader } from '../components/store/StorePageLoader'

type TabId = 'profile' | 'orders' | 'favorites' | 'wantlist' | 'selltrade' | 'credit' | 'notifications'
const TAB_IDS: TabId[] = ['profile', 'orders', 'favorites', 'wantlist', 'selltrade', 'credit', 'notifications']

/** Wrap a lucide icon with a fixed playful tint (and fill, where it reads well). */
function tinted(Icon: LucideIcon, tintClasses: string) {
  return function TintedIcon({ className }: { className?: string }) {
    return <Icon aria-hidden className={`${className ?? ''} ${tintClasses}`} />
  }
}

const TAB_ICONS = {
  profile: tinted(Smile, 'text-amber-500'),
  orders: tinted(PackageOpen, 'text-sky-500'),
  favorites: tinted(Heart, 'fill-pink-400 text-pink-500'),
  wantlist: tinted(Sparkles, 'fill-amber-300 text-amber-500'),
  selltrade: tinted(HandCoins, 'text-emerald-600'),
  credit: tinted(PiggyBank, 'text-rose-500'),
  notifications: tinted(BellRing, 'fill-violet-200 text-violet-500'),
}

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
  const unreadCount = (notificationsQuery.data ?? []).filter((n) => !n.readAt).length
  const favoritesCount = favoritesQuery.data?.length ?? 0
  const wantListCount = wantListQuery.data?.length ?? 0
  const ordersCount = ordersQuery.data?.length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="My account"
        subtitle={storeQuery.data ? `Your profile at ${storeQuery.data.name}` : 'Your store profile'}
        actions={<BackButton to={`/s/${slug}`}>Back to store</BackButton>}
      />

      <Card>
        <CardBody className="flex items-center gap-4">
          <Avatar name={user?.displayName ?? '?'} src={user?.avatarUrl ?? undefined} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-bold text-fg">{user?.displayName ?? 'Signed-in customer'}</p>
            <p className="truncate text-sm text-fg-muted">{user?.email}</p>
          </div>
        </CardBody>
      </Card>

      <NotificationsPanel slug={slug} query={notificationsQuery} />

      <Tabs
        aria-label="Account sections"
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: 'profile', label: 'Profile', icon: TAB_ICONS.profile },
          { id: 'orders', label: `Orders (${ordersCount})`, icon: TAB_ICONS.orders },
          { id: 'favorites', label: `Favorites (${favoritesCount})`, icon: TAB_ICONS.favorites },
          { id: 'wantlist', label: `Want list (${wantListCount})`, icon: TAB_ICONS.wantlist },
          { id: 'selltrade', label: 'Sell / Trade', icon: TAB_ICONS.selltrade },
          { id: 'credit', label: creditQuery.data && creditQuery.data.balanceCents > 0 ? `Store credit (${formatPrice(creditQuery.data.balanceCents)})` : 'Store credit', icon: TAB_ICONS.credit },
          { id: 'notifications', label: unreadCount > 0 ? `Notifications (${unreadCount})` : 'Notifications', icon: TAB_ICONS.notifications },
        ]}
      />

      <TabPanel when="profile" value={tab}>
        <ProfilePanel slug={slug} />
        <Card className="mt-6">
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
        <StoreCreditPanel slug={slug} query={creditQuery} storeName={storeQuery.data?.name ?? 'this store'} />
      </TabPanel>
      <TabPanel when="notifications" value={tab}>
        <NotificationsTabPanel slug={slug} query={notificationsQuery} />
      </TabPanel>
    </div>
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

function NotificationsPanel({
  slug,
  query,
}: {
  slug: string
  query: ReturnType<typeof useCustomerNotifications>
}) {
  const queryClient = useQueryClient()
  const notifications = (query.data ?? []).filter((notification) => !notification.readAt)

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/stores/${slug}/customer/notifications/${id}/read`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.notifications(slug) }),
  })

  if (query.isLoading || notifications.length === 0) return null

  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <p className="font-bold text-fg">Notifications</p>
          <p className="text-sm text-fg-muted">Order updates from this store.</p>
        </div>
        <NotificationList
          notifications={notifications}
          pendingId={markRead.variables}
          onMarkRead={(id) => markRead.mutate(id)}
        />
      </CardBody>
    </Card>
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
            icon={BellRing}
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
              <PiggyBank aria-hidden className="size-6" />
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
              icon={PiggyBank}
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
  paymentBrand: z.string().max(40),
  paymentLast4: z
    .string()
    .refine((v) => v === '' || /^\d{4}$/.test(v), 'Enter the last 4 digits.'),
  paymentExpires: z
    .string()
    .refine((v) => v === '' || /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.test(v), 'Use MM/YY or MM/YYYY.'),
})

type ProfileForm = z.infer<typeof profileSchema>

const EMPTY_PROFILE: ProfileForm = {
  phone: '',
  shippingAddress: '',
  paymentBrand: '',
  paymentLast4: '',
  paymentExpires: '',
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

  // Populate the form once the profile loads (or when switching stores).
  useEffect(() => {
    const data = profileQuery.data
    if (!data) return
    reset({
      phone: data.phone ?? '',
      shippingAddress: data.shippingAddress ?? '',
      paymentBrand: data.paymentBrand ?? '',
      paymentLast4: data.paymentLast4 ?? '',
      paymentExpires: data.paymentExpires ?? '',
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
        paymentBrand: data.paymentBrand ?? '',
        paymentLast4: data.paymentLast4 ?? '',
        paymentExpires: data.paymentExpires ?? '',
      })
      setSaved(true)
    },
  })

  if (profileQuery.isLoading) return <StorePageLoader label="Loading your profile…" />
  if (profileQuery.isError) {
    return <ErrorState title="Could not load your profile." onRetry={() => void profileQuery.refetch()} />
  }

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setSaved(false)
        mutation.mutate(values)
      })}
      className="grid gap-6 lg:grid-cols-2"
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
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Payment method"
          subtitle="Stored for reference only — never the full card number."
        />
        <CardBody className="space-y-4">
          <Input
            label="Card brand"
            placeholder="Visa, Mastercard…"
            error={errors.paymentBrand?.message}
            {...register('paymentBrand')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Last 4 digits"
              inputMode="numeric"
              maxLength={4}
              placeholder="4242"
              error={errors.paymentLast4?.message}
              {...register('paymentLast4')}
            />
            <Input
              label="Expires"
              placeholder="MM/YYYY"
              error={errors.paymentExpires?.message}
              {...register('paymentExpires')}
            />
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-4 lg:col-span-2">
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
            {httpStatus(mutation.error) === 422
              ? 'Please check your payment details and try again.'
              : 'Could not save your profile. Please try again.'}
          </span>
        )}
      </div>
    </form>
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
        icon={Heart}
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        {query.isLoading ? (
          <LoadingPanel label="Loading want list…" />
        ) : query.isError ? (
          <ErrorState title="Could not load your want list." onRetry={() => void query.refetch()} />
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="Your want list is empty"
            description="Search for cards you're hunting for so this store knows what you're after."
          />
        ) : (
          <ul className="space-y-3">
            {(query.data ?? []).map((entry) => (
              <li key={entry.id}>
                <Card>
                  <CardBody className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {entry.card && cardImage(entry.card) && (
                        <img
                          src={cardImage(entry.card)}
                          alt=""
                          className="h-14 w-10 flex-shrink-0 rounded-btn border border-border object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-fg">{entry.cardName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
                          {entry.setCode && <Badge>{entry.setCode.toUpperCase()}</Badge>}
                          <Badge tone={entry.isFoil ? 'brand' : 'neutral'}>
                            {entry.finish}
                          </Badge>
                          <span>Qty {entry.quantity}</span>
                        </div>
                        {entry.notes && <p className="mt-1 truncate text-sm text-fg-muted">{entry.notes}</p>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-700"
                      loading={removeMutation.isPending && removeMutation.variables === entry.id}
                      onClick={() => removeMutation.mutate(entry.id)}
                      aria-label={`Remove ${entry.cardName} from want list`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <WantListAddForm slug={slug} />
    </div>
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
    <Card className="h-fit">
      <CardHeader title="Add a card" subtitle="Search the catalog so the store knows the exact printing." />
      <CardBody>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (cardName.length > 0) addMutation.mutate()
          }}
          className="space-y-4"
        >
          <Field label="Card" htmlFor="wantlist-card-search">
            <div ref={boxRef} className="relative">
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
                  className="w-full rounded-btn border border-border bg-surface py-2 pl-9 pr-9 text-sm text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {searchQuery.isFetching && (
                  <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />
                )}
                {!searchQuery.isFetching && term && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-btn p-1 text-fg-muted hover:bg-bg"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>

              {open && !selected && debouncedTerm.length >= 2 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-card border border-border bg-surface p-1 shadow-card">
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
                        className="flex w-full items-center gap-3 rounded-btn px-2 py-1.5 text-left hover:bg-bg"
                      >
                        <span className="grid h-12 w-9 flex-shrink-0 place-items-center overflow-hidden rounded border border-border bg-bg">
                          {cardImage(card) ? (
                            <img src={cardImage(card)} alt="" className="h-full w-full object-cover" />
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
              )}
            </div>
          </Field>

          {selected && (
            <div className="flex items-center gap-2 rounded-card border border-border bg-bg px-3 py-2 text-sm">
              <Badge tone="brand">{selected.setCode?.toUpperCase() ?? '—'}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{selected.name}</span>
              <button type="button" onClick={clearSelection} aria-label="Remove selected card" className="text-fg-muted hover:text-fg">
                <X aria-hidden className="size-4" />
              </button>
            </div>
          )}

          <Input
            label="Quantity"
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          />

          <Field label="Foil">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={isFoil}
                onChange={(event) => setIsFoil(event.target.checked)}
              />
              Looking for a foil copy
            </label>
          </Field>

          <Textarea
            label="Notes"
            rows={2}
            placeholder="Condition, budget, etc."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {addMutation.isError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              Could not add to your want list. Please try again.
            </p>
          )}

          <Button type="submit" loading={addMutation.isPending} disabled={cardName.length === 0} className="w-full">
            <Plus aria-hidden className="size-4" />
            Add to want list
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
