import { Link, useSearchParams } from 'react-router'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Store as StoreIcon, ArrowRight } from 'lucide-react'
import api, { ACCOUNT_PAGE_SIZE } from '../api/client'
import type { Store as StoreType } from '../api/types'
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
  ProfileAsideCard,
  ProfileAsideLink,
  ProfileHero,
  ProfileLayout,
  ProfilePanelCard,
  ProfileSection,
  ProfileSideNav,
  ProfileNavBadge,
  ProfileStatistics,
  accountNavIcons,
  storeActivityIcons,
} from '../components/profile'
import { CardBody, CardHeader, EmptyState, LoadingPanel, Pagination } from '../components/ui'
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
  orders: ['order_fulfilled'],
  selltrade: ['sell_trade_accepted', 'sell_trade_declined', 'sell_trade_completed'],
  wantlist: ['want_list_match'],
}

/**
 * Global account: one identity and one activity hub across the marketplace.
 * A store filter narrows orders, want list, favorites, and the rest.
 */
export default function AccountPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section') as AccountSection | null
  const section: AccountSection =
    sectionParam && SECTIONS.includes(sectionParam) ? sectionParam : 'overview'
  const storeSlug = searchParams.get('store') || undefined
  const [ordersPage, setOrdersPage] = useState(1)
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
    setStoresPage(1)
    applyParams(section, slug)
  }

  useEffect(() => {
    setStoresPage(1)
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

  const navItems = [
    { id: 'overview', label: 'Overview', icon: accountNavIcons.overview },
    { id: 'orders', label: 'Orders', icon: accountNavIcons.orders },
    { id: 'favorites', label: 'Favorites', icon: storeActivityIcons.favorites },
    { id: 'wantlist', label: 'Want list', icon: storeActivityIcons.wantlist },
    { id: 'selltrade', label: 'Sell / Trade', icon: storeActivityIcons.selltrade },
    { id: 'credit', label: 'Store credit', icon: storeActivityIcons.credit },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: storeActivityIcons.notifications,
      badge: unreadCount > 0 ? <ProfileNavBadge count={unreadCount} tone="attention" /> : null,
    },
    { id: 'stores', label: 'Your stores', icon: accountNavIcons.stores },
    { id: 'settings', label: 'Settings', icon: accountNavIcons.settings },
  ]

  const activeLabel = String(navItems.find((item) => item.id === section)?.label ?? 'Overview')

  return (
    <ProfileLayout
      navTitle="My account"
      activeLabel={activeLabel}
      navAlert={unreadCount > 0}
      nav={<ProfileSideNav title="My account" items={navItems} value={section} onChange={(id) => setSection(id as AccountSection)} />}
      aside={
        <>
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
              <ul className="space-y-0.5">
                {stores.slice(0, 5).map((store) => (
                  <li key={store.id}>
                    <button
                      type="button"
                      onClick={() => setStoreFilter(store.slug)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-bg"
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
            <ProfileAsideLink to="/stores" icon={accountNavIcons.stores} label="Marketplace" meta="Find a store" />
            <ProfileAsideLink
              to="/account?section=orders"
              icon={accountNavIcons.orders}
              label="All orders"
              meta="Every store"
            />
          </ProfileAsideCard>
        </>
      }
    >
      <div className={section === 'overview' ? undefined : 'hidden lg:block'}>
        <ProfileHero
          displayName={user?.displayName ?? 'Your account'}
          avatarUrl={user?.avatarUrl}
          handle={user?.email}
          joinedLabel={filteredStoreName ? `Showing ${filteredStoreName}` : 'Every store on this account'}
          footer={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                to="/account?section=settings"
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm hover:bg-bg"
              >
                Edit profile
              </Link>
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
              ) : null}
            </div>
          }
        />
      </div>

      <div className="xl:hidden">
        <StoreFilterSelect stores={pickerStores} value={storeSlug} onChange={setStoreFilter} />
      </div>

      {section === 'overview' && (
        <>
          <ProfileSection title="Statistics">
            <ProfileStatistics
              stats={[
                { id: 'stores', label: 'Stores', value: stores.length, icon: accountNavIcons.stores, iconClassName: '' },
                { id: 'orders', label: 'Orders', value: orderTotal, icon: accountNavIcons.orders, iconClassName: '' },
                { id: 'want', label: 'Want list', value: wantListCount, icon: storeActivityIcons.wantlist, iconClassName: '' },
                { id: 'favorites', label: 'Favorites', value: favoritesCount, icon: storeActivityIcons.favorites, iconClassName: '' },
              ]}
            />
          </ProfileSection>
          <ProfileSection title="Get started">
            <div className="grid gap-3 sm:grid-cols-2">
              <OverviewTile
                title="Your orders"
                text={
                  orderTotal > 0
                    ? `${orderTotal} order${orderTotal === 1 ? '' : 's'}${filteredStoreName ? ` at ${filteredStoreName}` : ' across every store'}`
                    : 'Orders from any store show up here once you check out.'
                }
                onClick={() => setSection('orders')}
              />
              <OverviewTile
                title="Want list"
                text={
                  wantListCount > 0
                    ? `${wantListCount} card${wantListCount === 1 ? '' : 's'} you are hunting`
                    : 'Search the catalog and pick which store should watch for a card.'
                }
                onClick={() => setSection('wantlist')}
              />
              <OverviewTile
                title="Your stores"
                text={`${stores.length} store${stores.length === 1 ? '' : 's'}${totalSubmissions ? ` · ${totalSubmissions} sell/trade` : ''}`}
                onClick={() => setSection('stores')}
              />
              <OverviewTile
                title="Favorites"
                text={
                  favoritesCount > 0
                    ? `${favoritesCount} saved listing${favoritesCount === 1 ? '' : 's'}`
                    : 'Heart a listing on a storefront and it lands here.'
                }
                onClick={() => setSection('favorites')}
              />
            </div>
          </ProfileSection>
        </>
      )}

      {section === 'orders' && (
        <ProfileSection title="Orders">
          <PaginatedCustomerOrdersList
            query={ordersQuery}
            page={ordersPage}
            onPageChange={setOrdersPage}
            compact
            headerTitle={filteredStoreName ?? 'Marketplace-wide'}
            headerSubtitle={filteredStoreName ? `Newest first at ${filteredStoreName}.` : 'Newest first. Filter by store in the sidebar.'}
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
          <ProfilePanelCard>
            <CardHeader
              title="Everywhere you've played"
              subtitle="Filter your profile to a store, or jump straight to its shop."
            />
            <CardBody>
              {storesQuery.isLoading ? (
                <LoadingPanel />
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
                <ul className="space-y-2">
                  {stores.slice((storesPage - 1) * ACCOUNT_PAGE_SIZE, storesPage * ACCOUNT_PAGE_SIZE).map((store) => (
                    <li
                      key={store.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg/50 p-3 sm:flex-nowrap"
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
                          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm font-bold text-fg hover:bg-bg sm:flex-none"
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
              )}
              {stores.length > 0 ? (
                <Pagination
                  className="mt-4"
                  page={storesPage}
                  pageCount={Math.max(1, Math.ceil(stores.length / ACCOUNT_PAGE_SIZE))}
                  onPageChange={setStoresPage}
                  totalItems={stores.length}
                />
              ) : null}
            </CardBody>
          </ProfilePanelCard>
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

function OverviewTile({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-surface px-4 py-4 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-950/20"
    >
      <p className="font-bold text-fg">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{text}</p>
    </button>
  )
}
