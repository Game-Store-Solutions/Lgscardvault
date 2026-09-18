import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Calendar,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  GalleryHorizontalEnd,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Moon,
  Package,
  Palette,
  Pin,
  ReceiptText,
  RefreshCw,
  Settings,
  Store,
  Sun,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { APP_CHROME_CLASS, useOpenStoreOrderCount, usePendingSellSubmissionCount, useStore, useTheme } from '../../hooks'
import { Avatar, BackButton, Button, buttonVariants } from '../ui'
import { ProfileNavBadge } from '../profile'
import { PageTransition } from '../motion'
import { SkipToContent } from './SkipToContent'
import { AdminChromeProvider } from './AdminChromeContext'
import { CASE_CARDS_LABEL } from '../../pages/utils/actionsUtil'
import { cx } from '../../lib/cx'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

interface NavSection {
  heading: string | null
  items: NavItem[]
}

function useAdminNav(): { context: string | null; sections: NavSection[] } {
  const location = useLocation()
  const params = useParams()
  const isPlatform = location.pathname.startsWith('/platform/admin')

  if (isPlatform) {
    return {
      context: 'Platform administration',
      sections: [
        { heading: null, items: [{ to: '/platform/admin', label: 'Overview', icon: LayoutDashboard, end: true }] },
        {
          heading: 'Catalog',
          items: [{ to: '/platform/admin/sync-jobs', label: 'Sync jobs', icon: RefreshCw }],
        },
        {
          heading: 'Commerce',
          items: [{ to: '/platform/admin/reports', label: 'Reports', icon: TrendingUp }],
        },
        {
          heading: 'Platform',
          items: [
            { to: '/platform/admin/users', label: 'Users', icon: Users },
            { to: '/platform/admin/order-history', label: 'Order history', icon: FileSpreadsheet },
            { to: '/platform/admin/newsletter', label: 'Newsletter', icon: Mail },
            { to: '/platform/admin/patch-notes', label: 'Patch notes', icon: Megaphone },
          ],
        },
      ],
    }
  }

  const slug = params.slug
  const base = slug ? `/s/${slug}/admin` : '/'

  return {
    context: null,
    sections: [
      {
        heading: 'Inventory',
        items: [
          { to: base, label: 'Singles', icon: Boxes, end: true },
          { to: `${base}/sealed`, label: 'Sealed', icon: Package },
          { to: `${base}/case-cards`, label: CASE_CARDS_LABEL, icon: GalleryHorizontalEnd },
          { to: `${base}/csv`, label: 'Imports', icon: FileSpreadsheet },
        ],
      },
      {
        heading: 'Commerce',
        items: [
          { to: `${base}/orders`, label: 'Orders', icon: ReceiptText },
          { to: `${base}/sell-trade`, label: 'Sell / Trade', icon: WalletCards },
          { to: `${base}/store-credit`, label: 'Store credit', icon: Wallet },
          { to: `${base}/payments`, label: 'Payments', icon: CreditCard },
          { to: `${base}/reports`, label: 'Reports', icon: TrendingUp },
        ],
      },
      {
        heading: 'Storefront',
        items: [
          { to: `${base}/branding`, label: 'Branding', icon: Palette },
          { to: `${base}/events`, label: 'Events', icon: Calendar },
          { to: `${base}/spotlight`, label: 'Spotlight', icon: Pin },
          { to: `${base}/patch-notes`, label: 'Patch notes', icon: Megaphone },
          { to: `${base}/users`, label: 'Users', icon: Users },
        ],
      },
      {
        heading: 'Admin',
        items: [{ to: `${base}/settings`, label: 'Admin settings', icon: Settings }],
      },
    ],
  }
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const { context, sections } = useAdminNav()
  const params = useParams()
  const { data: store } = useStore(params.slug)
  const { theme, toggleTheme } = useTheme()
  const { data: openOrderCount = 0 } = useOpenStoreOrderCount(params.slug ?? '', Boolean(params.slug))
  const { data: pendingSellCount = 0 } = usePendingSellSubmissionCount(params.slug ?? '', Boolean(params.slug))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isPlatformAdmin = location.pathname.startsWith('/platform/admin')
  const isStoreAdmin = /\/s\/[^/]+\/admin/.test(location.pathname)
  const fullWidthAdmin = isStoreAdmin && !isPlatformAdmin
  const brandLabel = isPlatformAdmin ? 'StoreOps' : store?.name ? `${store.name} admin` : 'Store admin'
  const storeLogoUrl = !isPlatformAdmin ? store?.logoUrl?.trim() || null : null

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex items-center gap-2.5 border-l-2 px-3 py-1.5 text-sm font-medium transition-colors',
      isActive
        ? 'border-fg bg-bg text-fg'
        : 'border-transparent text-fg-muted hover:bg-bg hover:text-fg',
    )

  return (
    <AdminChromeProvider>
      <div className="admin-console min-h-screen bg-bg text-fg">
        <SkipToContent />
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-fg/30 lg:hidden"
          />
        )}

        <aside
          className={cx(
            APP_CHROME_CLASS,
            'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface',
            'transition-transform lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between gap-2 border-b border-border px-3">
            <Link to="/" className="flex min-w-0 items-center gap-2 font-display text-[0.95rem] font-bold tracking-tight text-fg">
              <span
                className={cx(
                  'grid size-8 shrink-0 place-items-center overflow-hidden rounded',
                  storeLogoUrl ? 'bg-bg ring-1 ring-border' : 'bg-fg text-bg',
                )}
              >
                {storeLogoUrl ? (
                  <img src={storeLogoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Store aria-hidden className="size-4" />
                )}
              </span>
              <span className="truncate">{brandLabel}</span>
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
              className="rounded p-2 text-fg-muted hover:bg-bg lg:hidden"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-3">
            {context ? (
              <p className="px-4 pb-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-fg-muted">
                {context}
              </p>
            ) : null}

            {sections.map((section, index) => (
              <div key={section.heading ?? `group-${index}`} className={index > 0 ? 'mt-4' : undefined}>
                {section.heading && (
                  <p className="px-4 pb-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-fg-muted">
                    {section.heading}
                  </p>
                )}
                <div className="flex flex-col">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setSidebarOpen(false)}
                        className={navLinkClass}
                      >
                        <Icon aria-hidden className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.label === 'Orders' && openOrderCount > 0 && (
                          <ProfileNavBadge count={openOrderCount} />
                        )}
                        {item.label === 'Sell / Trade' && pendingSellCount > 0 && (
                          <ProfileNavBadge count={pendingSellCount} />
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-border p-2">
            <BackButton to="/" tone="soft" className="w-full justify-start rounded px-3 shadow-none">
              Back to public site
            </BackButton>
          </div>
        </aside>

        <div className="min-w-0 lg:pl-60">
          <header
            className={cx(
              APP_CHROME_CLASS,
              'sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-5',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
                className="rounded p-2 text-fg-muted hover:bg-bg lg:hidden"
              >
                <Menu aria-hidden className="size-5" />
              </button>
              <span className={cx('truncate text-sm font-semibold text-fg', isPlatformAdmin ? '' : 'lg:hidden')}>
                {isPlatformAdmin ? context : brandLabel}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="grid size-9 place-items-center rounded text-fg-muted transition-colors hover:bg-bg hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {theme === 'dark' ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
              </button>
              <Link to="/" className={cx(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-fg-muted')}>
                <ExternalLink aria-hidden className="size-4" />
                <span className="hidden sm:inline">View site</span>
              </Link>
              {user && (
                <>
                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
                  <span className="flex items-center gap-2.5 px-1.5 text-sm text-fg-muted" title={user.displayName}>
                    <Avatar name={user.displayName} size="sm" />
                    <span className="sr-only">{user.displayName}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={logout} className="text-fg-muted">
                    <LogOut aria-hidden className="size-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                </>
              )}
            </div>
          </header>

          <main
            id="main-content"
            className={
              fullWidthAdmin
                ? `${APP_CHROME_CLASS} w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8`
                : `${APP_CHROME_CLASS} mx-auto max-w-7xl min-w-0 px-4 py-6`
            }
          >
            <PageTransition routeKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
    </AdminChromeProvider>
  )
}
