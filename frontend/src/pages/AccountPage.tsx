import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Settings, Store as StoreIcon, ArrowRight } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { AccountSettingsPanel } from '../components/account/AccountSettingsPanel'
import { AccountPaymentPanel } from '../components/account/AccountPaymentPanel'
import { DecksPanel } from '../components/account/DecksPanel'
import {
  ProfileAsideCard,
  ProfileAsideLink,
  ProfileHero,
  ProfileLayout,
  ProfilePanelCard,
  ProfileSection,
  ProfileSideNav,
  ProfileStatistics,
  accountNavIcons,
  storeAsideIcons,
} from '../components/profile'
import { CardBody, CardHeader, EmptyState, LoadingPanel } from '../components/ui'
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

type AccountSection = 'overview' | 'stores' | 'decks' | 'payment' | 'settings'
const SECTIONS: AccountSection[] = ['overview', 'stores', 'decks', 'payment', 'settings']

/**
 * Global account page: one identity across the whole marketplace. The
 * name/avatar/password/deletion settings live here; per-store activity
 * (orders, favorites, want lists, sell/trade) stays on each store's
 * account page, linked from the "your stores" list below.
 */
export default function AccountPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section') as AccountSection | null
  const section: AccountSection =
    sectionParam && SECTIONS.includes(sectionParam) ? sectionParam : 'overview'

  const setSection = (next: AccountSection) => {
    setSearchParams(next === 'overview' ? {} : { section: next }, { replace: true })
  }

  const storesQuery = useQuery({
    queryKey: ['my-stores'],
    queryFn: async () => {
      const { data } = await api.get<MyStore[]>('/me/stores')
      return data
    },
  })

  const decksQuery = useQuery({
    queryKey: ['my-decks'],
    queryFn: async () => {
      const { data } = await api.get<unknown[]>('/me/decks')
      return data
    },
  })

  const stores = storesQuery.data ?? []
  const totalOrders = stores.reduce((n, s) => n + s.orderCount, 0)
  const totalSubmissions = stores.reduce((n, s) => n + s.submissionCount, 0)
  const deckCount = decksQuery.data?.length ?? 0

  const navItems = [
    { id: 'overview', label: 'Overview', icon: accountNavIcons.overview },
    { id: 'stores', label: 'Your stores', icon: accountNavIcons.stores, badge: stores.length ? <span className="text-xs">{stores.length}</span> : null },
    { id: 'decks', label: 'Decks', icon: accountNavIcons.decks, badge: deckCount ? <span className="text-xs">{deckCount}</span> : null },
    { id: 'payment', label: 'Payment', icon: accountNavIcons.payment },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <ProfileLayout
      nav={<ProfileSideNav title="My account" items={navItems} value={section} onChange={(id) => setSection(id as AccountSection)} />}
      aside={
        <>
          <ProfileAsideCard title="Your stores">
            {storesQuery.isLoading ? (
              <p className="px-3 py-2 text-sm text-fg-muted">Loading…</p>
            ) : stores.length === 0 ? (
              <p className="px-3 py-4 text-sm text-fg-muted">Shop a store to see it here.</p>
            ) : (
              <ul className="space-y-0.5">
                {stores.slice(0, 5).map((store) => (
                  <li key={store.id}>
                    <Link
                      to={`/s/${store.slug}/account`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-bg"
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
                    </Link>
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
            <ProfileAsideLink to="/" icon={accountNavIcons.stores} label="Marketplace" meta="Find a store" />
            <ProfileAsideLink to="/account?section=payment" icon={storeAsideIcons.payments} label="Payment method" meta="Saved for checkout" />
          </ProfileAsideCard>
        </>
      }
    >
      <ProfileHero
        displayName={user?.displayName ?? 'Your account'}
        avatarUrl={user?.avatarUrl}
        handle={user?.email}
        joinedLabel={user?.paymentConfigured ? 'Payment saved on account' : undefined}
        footer={
          <Link
            to="/account?section=settings"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm hover:bg-bg"
          >
            Edit profile
          </Link>
        }
      />

      <ProfileSection title="Statistics">
        <ProfileStatistics
          stats={[
            { id: 'stores', label: 'Stores', value: stores.length, icon: accountNavIcons.stores, iconClassName: '' },
            { id: 'orders', label: 'Orders', value: totalOrders, icon: accountNavIcons.orders, iconClassName: '' },
            { id: 'decks', label: 'Decks', value: deckCount, icon: accountNavIcons.decks, iconClassName: '' },
            {
              id: 'payment',
              label: 'Wallet',
              value: user?.paymentConfigured ? 'On' : 'Off',
              icon: accountNavIcons.payment,
              iconClassName: '',
            },
          ]}
        />
      </ProfileSection>

      {section === 'overview' && (
        <ProfileSection title="Get started">
          <div className="grid gap-3 sm:grid-cols-2">
            <OverviewTile
              title="Your stores"
              text={`${stores.length} store${stores.length === 1 ? '' : 's'} · ${totalOrders} order${totalOrders === 1 ? '' : 's'}${totalSubmissions ? ` · ${totalSubmissions} sell/trade` : ''}`}
              onClick={() => setSection('stores')}
            />
            <OverviewTile
              title="Payment method"
              text={user?.paymentConfigured ? `Saved · •••• ${user.paymentLast4 ?? '····'}` : 'Add a card for faster checkout everywhere.'}
              onClick={() => setSection('payment')}
            />
          </div>
        </ProfileSection>
      )}

      {section === 'stores' && (
        <ProfileSection title="Your stores">
          <ProfilePanelCard>
            <CardHeader
              title="Everywhere you've played"
              subtitle="Orders, favorites, and sell/trade history live on each store's profile page."
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
                    <Link to="/" className="text-sm font-bold text-brand-600 hover:underline">
                      Find a store →
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {stores.map((store) => (
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
                        <Link
                          to={`/s/${store.slug}/account`}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600 sm:flex-none"
                        >
                          My activity
                          <ArrowRight aria-hidden className="size-4" />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </ProfilePanelCard>
        </ProfileSection>
      )}

      {section === 'decks' && (
        <ProfileSection title="Decks">
          <DecksPanel stores={stores.map((store) => ({ slug: store.slug, name: store.name }))} />
        </ProfileSection>
      )}

      {section === 'payment' && (
        <ProfileSection title="Payment">
          <AccountPaymentPanel />
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
