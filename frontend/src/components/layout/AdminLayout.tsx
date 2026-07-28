import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useOrders, useStore, useStoreTheme } from '../../hooks'
import { Avatar, Button, buttonVariants } from '../ui'
import {
  Boxes,
  ExternalLink,
  FileSpreadsheet,
  GalleryHorizontalEnd,
  LayoutDashboard,
  Megaphone,
  LogOut,
  Menu,
  Package,
  Palette,
  CreditCard,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Store,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

function useAdminNav(): { context: string; items: NavItem[] } {
  const location = useLocation()
  const params = useParams()
  const isPlatform = location.pathname.startsWith('/platform/admin')

  if (isPlatform) {
    return {
      context: 'Platform administration',
      items: [
        { to: '/platform/admin', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/platform/admin/sync-jobs', label: 'Sync jobs', icon: RefreshCw },
        { to: '/platform/admin/patch-notes', label: 'Patch notes', icon: Megaphone },
      ],
    }
  }

  const slug = params.slug
  const base = slug ? `/s/${slug}/admin` : '/'
  return {
    context: 'Store administration',
    items: [
      { to: base, label: 'Inventory', icon: Boxes, end: true },
      { to: `${base}/sealed`, label: 'Sealed', icon: Package },
      { to: `${base}/branding`, label: 'Branding', icon: Palette },
      { to: `${base}/spotlight`, label: 'Spotlight', icon: Sparkles },
      { to: `${base}/case-cards`, label: 'Case cards', icon: GalleryHorizontalEnd },
      { to: `${base}/payments`, label: 'Payments', icon: CreditCard },
      { to: `${base}/orders`, label: 'Orders', icon: ReceiptText },
      { to: `${base}/sell-trade`, label: 'Sell / Trade', icon: WalletCards },
      { to: `${base}/reports`, label: 'Reports', icon: TrendingUp },
      { to: `${base}/csv`, label: 'CSV import', icon: FileSpreadsheet },
      { to: `${base}/patch-notes`, label: 'Patch notes', icon: Megaphone },
    ],
  }
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { context, items } = useAdminNav()
  const params = useParams()
  // Theme the owner admin portal with the store's branding (no-op for platform admin).
  const { data: store } = useStore(params.slug)
  useStoreTheme(store)
  const { data: orders = [] } = useOrders(params.slug ?? '')
  const activeOrderCount = orders.filter((order) =>
    order.status === 'pending' || order.status === 'received' || order.status === 'paid' || order.status === 'shipped',
  ).length
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-brand-50 text-brand-700'
        : 'text-fg-muted hover:bg-bg hover:text-fg',
    ].join(' ')

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-fg/30 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface',
          'transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-border px-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-fg">
            <span className="grid size-9 place-items-center rounded-btn bg-brand-500 text-sm font-bold text-white">
              <Store aria-hidden className="size-5" />
            </span>
            <span>StoreOps</span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="rounded-btn p-2 text-fg-muted hover:bg-bg lg:hidden"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {context}
          </p>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={navLinkClass}
              >
                <Icon aria-hidden className="size-4" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.label === 'Orders' && activeOrderCount > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger-600 px-1.5 text-[0.68rem] font-black leading-none text-white ring-2 ring-surface">
                    {activeOrderCount > 99 ? '99+' : activeOrderCount}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-medium text-fg-muted hover:bg-bg hover:text-fg"
          >
            <ExternalLink aria-hidden className="size-4" />
            Back to public site
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="rounded-btn p-2 text-fg-muted hover:bg-bg lg:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <span className="text-sm font-semibold text-fg">{context}</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <ExternalLink aria-hidden className="size-4" />
              <span className="hidden sm:inline">View site</span>
            </Link>
            {user && (
              <>
                <span className="flex items-center gap-2 text-sm text-fg-muted">
                  <Avatar name={user.displayName} size="sm" />
                  <span className="hidden sm:inline">{user.displayName}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={logout}>
                  <LogOut aria-hidden className="size-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
