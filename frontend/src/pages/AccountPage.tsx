import { Link, useSearchParams } from 'react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Store as StoreIcon, ArrowRight } from 'lucide-react'
import api, { ACCOUNT_PAGE_SIZE, PROFILE_ACTIVITY_PAGE_SIZE } from '../api/client'
import type { Store as StoreType, UserProfile } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { useActiveStores, useMarkAllNotificationsRead, useMyFavorites, useMyNotifications, useMyOrders, useMyWantList } from '../hooks'
import { AccountSettingsPanel } from '../components/account/AccountSettingsPanel'
import { WantListPanel } from '../components/account/WantListPanel'
import {
  FavoritesPanel,
  NotificationsPanel,
  SellTradeHistoryPanel,
  StoreCreditPanel,
  StoreFilterSelect,
} from '../components/account/AccountActivityPanels'
import { PaginatedCustomerOrdersList } from '../components/orders/PaginatedCustomerOrdersList'
import {
  ProfileActivityFeed,
  ProfileAsideCard,
  ProfileAsideLink,
  ProfileHero,
  ProfileIntroduction,
  ProfileLayout,
  ProfileSection,
  ProfileWantList,
} from '../components/profile'
import { EmptyState, LoadingPanel, Pagination, Tabs } from '../components/ui'
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

type AccountSection =
  | 'overview'
  | 'orders'
  | 'favorites'
  | 'wantlist'
  | 'selltrade'
  | 'credit'
  | 'notifications'
  | 'stores'
  | 'settings'

const SECTIONS: AccountSection[] = [
  'overview',
  'orders',
  'favorites',
  'wantlist',
  'selltrade',
  'credit',
  'notifications',
  'stores',
  'settings',
]

/** Opening a related tab marks those alerts read so the badge actually clears. */
const SECTION_ALERT_TYPES: Partial<Record<AccountSection, string[]>> = {
  orders: ['order_fulfilled', 'order_cancelled', 'order_balance_due'],
  selltrade: ['sell_trade_submitted', 'sell_trade_accepted', 'sell_trade_declined', 'sell_trade_completed'],
  wantlist: ['want_list_match'],
}

/**
 * Global account: one identity and one activity hub across the marketplace.
 * A store filter narrows orders, want list, favorites, and the rest.
 */
export default function AccountPage() {
  const { user, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section') as AccountSection | null
  const section: AccountSection =
    sectionParam && SECTIONS.includes(sectionParam) ? sectionParam : 'overview'
  const storeSlug = searchParams.get('store') || undefined
  const highlightOrderId = Number(searchParams.get('order') || '') || null
  const [ordersPage, setOrdersPage] = useState(1)
  const [activityPage, setActivityPage] = useState(1)
  const [storesPage, setStoresPage] = useState(1)

  const applyParams = (nextSection: AccountSection, nextStore?: string | null) => {
    const nextParams = new URLSearchParams()
    const storeValue = nextStore === undefined ? storeSlug : nextStore || undefined
    if (nextSection !== 'overview') nextParams.set('section', nextSection)
    if (storeValue) nextParams.set('store', storeValue)
    setSearchParams(nextParams, { replace: true })
  }

  const setSection = (next: AccountSection) => applyParams(next)
  const setStoreFilter = (slug: string) => {
    setOrdersPage(1)
    setActivityPage(1)
    setStoresPage(1)
    applyParams(section, slug)
  }

  useEffect(() => {
    setStoresPage(1)
    setActivityPage(1)
  }, [storeSlug])

  const storesQuery = useQuery({
    queryKey: ['my-stores'],
    queryFn: async () => {
      const { data } = await api.get<MyStore[]>('/me/stores')
      return data
    },
  })
  const marketplaceStores = useActiveStores()
  const pickerStores = (marketplaceStores.data ?? []).map((store: StoreType) => ({
    slug: store.slug,
    name: store.name,
  }))

  const ordersQuery = useMyOrders(ordersPage, Boolean(user), storeSlug)
  const activityOrdersQuery = useMyOrders(
    activityPage,
    Boolean(user) && section === 'overview',
    storeSlug,
    PROFILE_ACTIVITY_PAGE_SIZE,
  )
  const wantListQuery = useMyWantList(1, storeSlug, Boolean(user))
  const favoritesQuery = useMyFavorites(1, storeSlug, Boolean(user))
  const notificationsQuery = useMyNotifications(1, storeSlug, Boolean(user))

  const stores = storesQuery.data ?? []
  const orderTotal = ordersQuery.data?.total ?? stores.reduce((n, s) => n + s.orderCount, 0)
  const totalSubmissions = stores.reduce((n, s) => n + s.submissionCount, 0)
  const wantListCount = wantListQuery.data?.total ?? 0
  const favoritesCount = favoritesQuery.data?.total ?? 0
  const unreadCount = notificationsQuery.data?.unread ?? 0
  const filteredStoreName = pickerStores.find((s) => s.slug === storeSlug)?.name
  const sectionAlertTypes = SECTION_ALERT_TYPES[section]
  const markSectionAlertsRead = useMarkAllNotificationsRead(storeSlug, sectionAlertTypes)

  useEffect(() => {
    if (!user || !sectionAlertTypes) return
    markSectionAlertsRead.mutate()
    // Opening Orders / Sell-Trade / Want list clears those unread alerts.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per section + store
  }, [section, storeSlug, user])

  const saveCover = useMutation({
    mutationFn: async (payload: { coverImageUrl: string | null; coverColor: string | null }) => {
      await api.patch('/me', payload)
    },
    onSuccess: () => void refreshUser(),
  })

  const profileTabs = [
    { id: 'overview', label: 'Profile' },
    { id: 'orders', label: 'Orders' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'wantlist', label: 'Want list' },
    { id: 'selltrade', label: 'Sell / Trade' },
    { id: 'credit', label: 'Store credit' },
    {
      id: 'notifications',
      label: unreadCount > 0 ? `Alerts (${unreadCount > 99 ? '99+' : unreadCount})` : 'Alerts',
    },
    { id: 'stores', label: 'Stores' },
    { id: 'settings', label: 'Settings' },
  ]

  const activeLabel = String(profileTabs.find((item) => item.id === section)?.label ?? 'Profile')
  const roleLabel = accountRoleLabel(user)

  return (
    <ProfileLayout
      navTitle="My account"
      activeLabel={activeLabel}
      navAlert={unreadCount > 0}
      header={
        <ProfileHero
        displayName={user?.displayName ?? 'Your account'}
        avatarUrl={user?.avatarUrl}
        title={roleLabel}
        joinedLabel={filteredStoreName ? `Showing ${filteredStoreName}` : undefined}
        coverImageUrl={user?.coverImageUrl}
        coverColor={user?.coverColor}
        coverSaving={saveCover.isPending}
        onCoverChange={(next) => saveCover.mutate(next)}
        stats={[
          { id: 'orders', label: 'Orders', value: orderTotal, onClick: () => setSection('orders') },
          { id: 'want', label: 'Want list', value: wantListCount, onClick: () => setSection('wantlist') },
          { id: 'favorites', label: 'Favorites', value: favoritesCount, onClick: () => setSection('favorites') },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => setSection('settings')}
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-600"
            >
              Edit profile
            </button>
            {storeSlug ? (
              <>
                <button
                  type="button"
                  onClick={() => setStoreFilter('')}
                  className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm hover:bg-bg"
                >
                  All stores
                </button>
                <Link
                  to={`/s/${storeSlug}`}
                  className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm hover:bg-bg"
                >
                  Visit store
                </Link>
              </>
            ) : (
              <Link
                to="/stores"
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm hover:bg-bg"
              >
                Browse stores
              </Link>
            )}
          </>
        }
        tabs={
          <Tabs
            aria-label="Account sections"
            className="px-4 sm:px-6 lg:px-8 xl:px-10"
            tabs={profileTabs}
            value={section}
            onChange={(id) => setSection(id as AccountSection)}
          />
        }
      />
      }
      aside={
        <>
          <div className="hidden xl:block">
            <ProfileIntroduction
              stats={[
                { id: 'orders', label: 'Orders', value: orderTotal, onClick: () => setSection('orders') },
                { id: 'want', label: 'Want list', value: wantListCount, onClick: () => setSection('wantlist') },
                { id: 'favorites', label: 'Favorites', value: favoritesCount, onClick: () => setSection('favorites') },
                { id: 'sell', label: 'Sell / Trade', value: totalSubmissions, onClick: () => setSection('selltrade') },
              ]}
            />
          </div>
          <ProfileAsideCard title="Filter">
            <div className="px-3 py-2">
              <StoreFilterSelect stores={pickerStores} value={storeSlug} onChange={setStoreFilter} />
            </div>
          </ProfileAsideCard>
          <ProfileAsideCard title="Your stores">
            {storesQuery.isLoading ? (
              <p className="px-3 py-2 text-sm text-fg-muted">Loading…</p>
            ) : stores.length === 0 ? (
              <p className="px-3 py-4 text-sm text-fg-muted">Shop a store to see it here.</p>
            ) : (
              <ul>
                {stores.slice(0, 5).map((store) => (
                  <li key={store.id}>
                    <button
                      type="button"
                      onClick={() => setStoreFilter(store.slug)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    >
                      {store.logoUrl ? (
                        <img src={store.logoUrl} alt="" className="size-9 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600">
                          <StoreIcon aria-hidden className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-fg">{store.name}</span>
                        <span className="block text-xs text-fg-muted">
                          {store.orderCount} order{store.orderCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {stores.length > 5 ? (
                  <button
                    type="button"
                    onClick={() => setSection('stores')}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-brand-600 hover:underline"
                  >
                    View {stores.length - 5} more
                  </button>
                ) : null}
              </ul>
            )}
          </ProfileAsideCard>
          <ProfileAsideCard title="Quick links">
            <ProfileAsideLink to="/stores" label="Marketplace" meta="Find a store" />
            <ProfileAsideLink to="/account?section=orders" label="All orders" meta="Every store" />
          </ProfileAsideCard>
        </>
      }
    >
      <div className="mb-4 xl:hidden">
        <StoreFilterSelect stores={pickerStores} value={storeSlug} onChange={setStoreFilter} />
      </div>

      {section === 'overview' && (
        <div className="space-y-8">
          <ProfileIntroduction
            className="border-b border-border pb-6 xl:hidden"
            stats={[
              { id: 'orders', label: 'Orders', value: orderTotal, onClick: () => setSection('orders') },
              { id: 'want', label: 'Want list', value: wantListCount, onClick: () => setSection('wantlist') },
              { id: 'favorites', label: 'Favorites', value: favoritesCount, onClick: () => setSection('favorites') },
              { id: 'sell', label: 'Sell / Trade', value: totalSubmissions, onClick: () => setSection('selltrade') },
            ]}
          />
          <ProfileWantList
            entries={wantListQuery.data?.items ?? []}
            total={wantListCount}
            loading={wantListQuery.isLoading}
            onOpenWantList={() => setSection('wantlist')}
          />
          <ProfileActivityFeed
            orders={activityOrdersQuery.data?.items ?? []}
            notifications={notificationsQuery.data?.items ?? []}
            ordersTotal={activityOrdersQuery.data?.total ?? ordersQuery.data?.total ?? 0}
            page={activityPage}
            onPageChange={setActivityPage}
            onOpenOrders={(orderId) => {
              if (orderId) {
                const next = new URLSearchParams()
                next.set('section', 'orders')
                if (storeSlug) next.set('store', storeSlug)
                next.set('order', String(orderId))
                setOrdersPage(1)
                setSearchParams(next)
                return
              }
              setSection('orders')
            }}
          />
        </div>
      )}

      {section === 'orders' && (
        <ProfileSection title="Orders">
          <PaginatedCustomerOrdersList
            query={ordersQuery}
            page={ordersPage}
            onPageChange={setOrdersPage}
            compact
            highlightOrderId={highlightOrderId}
            headerTitle={filteredStoreName ?? 'Marketplace-wide'}
            headerSubtitle={filteredStoreName ? `Newest first at ${filteredStoreName}.` : 'Newest first.'}
            emptyDescription="When you check out at any store on this account, your orders will appear here."
            emptyAction={
              <Link to="/stores" className="text-sm font-bold text-brand-600 hover:underline">
                Browse stores →
              </Link>
            }
          />
        </ProfileSection>
      )}

      {section === 'favorites' && (
        <ProfileSection title="Favorites">
          <FavoritesPanel storeSlug={storeSlug} />
        </ProfileSection>
      )}

      {section === 'wantlist' && <WantListPanel stores={pickerStores} storeSlug={storeSlug} />}

      {section === 'selltrade' && (
        <ProfileSection title="Sell / Trade">
          <SellTradeHistoryPanel storeSlug={storeSlug} onClearStoreFilter={() => setStoreFilter('')} />
        </ProfileSection>
      )}

      {section === 'credit' && (
        <ProfileSection title="Store credit">
          <StoreCreditPanel storeSlug={storeSlug} onSelectStore={setStoreFilter} />
        </ProfileSection>
      )}

      {section === 'notifications' && (
        <ProfileSection title="Notifications">
          <NotificationsPanel storeSlug={storeSlug} />
        </ProfileSection>
      )}

      {section === 'stores' && (
        <ProfileSection title="Your stores">
          <p className="mb-4 text-sm text-fg-muted">
            Filter your profile to a store, or jump straight to its shop.
          </p>
          {storesQuery.isLoading ? (
            <LoadingPanel bare />
          ) : stores.length === 0 ? (
            <EmptyState
              icon={StoreIcon}
              title="No store activity yet"
              description="Browse the marketplace and your stores will show up here."
              action={
                <Link to="/stores" className="text-sm font-bold text-brand-600 hover:underline">
                  Find a store →
                </Link>
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {stores.slice((storesPage - 1) * ACCOUNT_PAGE_SIZE, storesPage * ACCOUNT_PAGE_SIZE).map((store) => (
                  <li
                    key={store.id}
                    className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap"
                  >
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
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
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Link
                        to={`/s/${store.slug}`}
                        className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-center text-sm font-bold text-fg hover:bg-black/[0.03] sm:flex-none"
                      >
                        Shop
                      </Link>
                      <button
                        type="button"
                        onClick={() => applyParams('overview', store.slug)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600 sm:flex-none"
                      >
                        Filter profile
                        <ArrowRight aria-hidden className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                className="mt-4"
                page={storesPage}
                pageCount={Math.max(1, Math.ceil(stores.length / ACCOUNT_PAGE_SIZE))}
                onPageChange={setStoresPage}
                totalItems={stores.length}
              />
            </>
          )}
        </ProfileSection>
      )}

      {section === 'settings' && (
        <ProfileSection title="Settings">
          <AccountSettingsPanel />
        </ProfileSection>
      )}
    </ProfileLayout>
  )
}

function accountRoleLabel(user: UserProfile | null): string {
  if (!user) return 'Collector'
  if (user.roles.includes('ROLE_SUPER_ADMIN')) return 'Platform admin'
  if (user.roles.includes('ROLE_STORE_OWNER')) return 'Store owner'
  return 'Collector'
}
