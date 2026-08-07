import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useCustomerCart, useGuestCart, useKioskMode, useTheme } from '../../hooks'
import { NotificationBell } from '../notifications/NotificationBell'
import { StoreFooter } from '../store/StoreFooter'
import { Avatar, Button, buttonVariants } from '../ui'
import { DEFAULT_APP_SHELL, STOREFRONT_SHELL } from '../../lib/layoutShell'
import { cx } from '../../lib/cx'
import { ChevronDown, LogIn, LogOut, Menu, Monitor, Moon, ShieldCheck, ShoppingCart, Store, Sun, UserCircle, UserPlus, X } from 'lucide-react'

export default function AppLayout() {
  const { user, logout, isSuperAdmin, isStoreOwner } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { kioskMode, enterKioskMode, exitKioskMode } = useKioskMode()
  const ownedStores = user?.ownedStores ?? []
  // The customer profile + cart are per-store, so only surface those links when
  // the current route is within a store (e.g. /s/:slug, /s/:slug/cards/:id).
  const storeMatch = useMatch('/s/:slug/*')
  const exactStoreMatch = useMatch('/s/:slug')
  const cardDetailMatch = useMatch('/s/:slug/cards/:id')
  const artistBrowseMatch = useMatch('/s/:slug/artists')
  const storeSlug = storeMatch?.params.slug ?? exactStoreMatch?.params.slug
  const pageShell = storeSlug ? STOREFRONT_SHELL : DEFAULT_APP_SHELL

  // Live cart count for the active store, so the navbar badge stays in sync.
  const { data: authedCart = [] } = useCustomerCart(storeSlug ?? '', Boolean(user && storeSlug))
  const { query: guestCartQuery } = useGuestCart(storeSlug ?? '', Boolean(!user && storeSlug))
  const guestCart = guestCartQuery.data ?? []
  const cart = user ? authedCart : guestCart
  const cartCount = cart.reduce((total: number, entry) => total + entry.quantity, 0)
  const cartBadge = cartCount > 99 ? '99+' : String(cartCount)
  const location = useLocation()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const storeMenuRef = useRef<HTMLDivElement | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
      if (!storeMenuRef.current?.contains(event.target as Node)) {
        setStoreMenuOpen(false)
      }
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700'
      : 'rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-bg hover:text-brand-600'

  const mobileLinkClass = 'block rounded-btn px-3 py-2.5 text-base font-medium text-fg hover:bg-bg'
  const closeMobile = () => setMobileOpen(false)

  const themeToggle = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="grid size-9 place-items-center rounded-btn border border-border bg-surface text-fg-muted transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {theme === 'dark' ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  )

  // Persistent, always-visible cart affordance (top-right) for the active store.
  const cartLink = storeSlug && (
    <Link
      to={`/s/${storeSlug}/cart`}
      aria-label={cartCount > 0 ? `Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Cart'}
      title="Cart"
      className="relative grid size-9 place-items-center rounded-btn border border-border bg-surface text-fg-muted transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <ShoppingCart aria-hidden className="size-4" />
      {cartCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-bold leading-none text-white ring-2 ring-surface">
          {cartBadge}
        </span>
      )}
    </Link>
  )

  // Kiosk mode: locked-down storefront chrome. No navigation, no account
  // controls — just the store pages and the cart. Only the store owner (or a
  // platform admin) can leave it; the terminal stays signed in as the owner.
  if (kioskMode) {
    return (
      <div className="flex min-h-screen flex-col bg-bg text-fg">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/80 shadow-sm backdrop-blur-xl">
          <div className={cx(pageShell, 'flex items-center justify-between gap-4 py-3')}>
            <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-fg">
              <span className="grid size-9 place-items-center rounded-btn bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm">
                LGS
              </span>
              <span className="hidden sm:inline">LGS Card Vault</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-700">
                Kiosk
              </span>
            </span>
            <div className="flex items-center gap-2">
              {cartLink}
              {(isStoreOwner || isSuperAdmin) && (
                <Button variant="secondary" size="sm" onClick={exitKioskMode}>
                  <Monitor aria-hidden className="size-4" />
                  Exit kiosk
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className={cx(pageShell, 'flex-1', cardDetailMatch || artistBrowseMatch ? 'py-0' : 'py-8')}>
          <Outlet />
        </main>

        {storeSlug && <StoreFooter slug={storeSlug} />}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 shadow-sm backdrop-blur-xl">
        <div className={cx(pageShell, 'flex items-center justify-between gap-4 py-3')}>
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-fg">
            <span className="grid size-9 place-items-center rounded-btn bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm">
              LGS
            </span>
            <span className="hidden sm:inline">LGS Card Vault</span>
          </Link>

          <div className="flex items-center gap-3">
          {/* Desktop navigation */}
          <nav className="hidden items-center gap-3 md:flex">
            <NavLink to="/" className={navLinkClass} end>
              Stores
            </NavLink>

            {/* One primary action per role; everything else lives in the avatar menu. */}
            {isSuperAdmin && (
              <Link to="/platform/admin" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <ShieldCheck aria-hidden className="size-4" />
                Platform admin
              </Link>
            )}

            {ownedStores.length === 1 && (
              <Link
                to={`/s/${ownedStores[0].slug}/admin`}
                className={buttonVariants({ variant: 'primary', size: 'sm' })}
              >
                <Store aria-hidden className="size-4" />
                My store
              </Link>
            )}

            {ownedStores.length > 1 && (
              <div ref={storeMenuRef} className="relative">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setStoreMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={storeMenuOpen}
                >
                  <Store aria-hidden className="size-4" />
                  My stores
                  <ChevronDown aria-hidden className="size-4" />
                </Button>
                {storeMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 min-w-56 rounded-card border border-border bg-surface p-2 shadow-card">
                    {ownedStores.map((store) => (
                      <Link
                        key={store.id}
                        to={`/s/${store.slug}/admin`}
                        onClick={() => setStoreMenuOpen(false)}
                        className="block rounded-btn px-3 py-2 text-sm text-fg hover:bg-bg"
                      >
                        {store.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {user ? (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-2 text-sm text-fg transition-colors hover:border-brand-300"
                >
                  <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size="sm" />
                  <span className="hidden max-w-32 truncate font-medium lg:inline">{user.displayName}</span>
                  <ChevronDown aria-hidden className="size-4 text-fg-muted" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-card border border-border bg-surface p-2 shadow-card">
                    <div className="border-b border-border px-3 pb-2 pt-1">
                      <p className="truncate text-sm font-bold text-fg">{user.displayName}</p>
                      <p className="truncate text-xs text-fg-muted">{user.email}</p>
                    </div>
                    {/* In a store, "My account" means your activity AT that store;
                        the global settings page gets its own entry below. */}
                    <Link
                      to={storeSlug ? `/s/${storeSlug}/account` : '/account'}
                      onClick={() => setUserMenuOpen(false)}
                      className="mt-1 flex items-center gap-2 rounded-btn px-3 py-2 text-sm text-fg hover:bg-bg"
                    >
                      <UserCircle aria-hidden className="size-4 text-fg-muted" />
                      My account
                    </Link>
                    {storeSlug && (
                      <Link
                        to="/account"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 rounded-btn px-3 py-2 text-sm text-fg hover:bg-bg"
                      >
                        <Store aria-hidden className="size-4 text-fg-muted" />
                        Account settings &amp; stores
                      </Link>
                    )}
                    {/* Kiosk terminals belong to stores: their owners flip the mode. */}
                    {isStoreOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false)
                          enterKioskMode()
                        }}
                        className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-fg hover:bg-bg"
                      >
                        <Monitor aria-hidden className="size-4 text-fg-muted" />
                        Enter kiosk mode
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                      className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-danger-700 hover:bg-bg"
                    >
                      <LogOut aria-hidden className="size-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  <LogIn aria-hidden className="size-4" />
                  Sign in
                </Link>
                <div ref={accountMenuRef} className="relative">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setAccountMenuOpen((current) => !current)}
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                  >
                    <UserPlus aria-hidden className="size-4" />
                    Sign up
                    <ChevronDown aria-hidden className="size-4" />
                  </Button>
                  {accountMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-card border border-border bg-surface p-2 shadow-card">
                      <Link
                        to="/register/customer"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block rounded-btn px-3 py-2 text-sm text-fg hover:bg-bg"
                      >
                        Customer
                      </Link>
                      <Link
                        to="/register/owner"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block rounded-btn px-3 py-2 text-sm text-fg hover:bg-bg"
                      >
                        Owner
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>

          {/* Cart — always visible top-right when inside a store */}
          {user && storeSlug && <NotificationBell slug={storeSlug} />}
          {cartLink}

          {/* Theme toggle (desktop) */}
          <div className="hidden md:block">{themeToggle}</div>

          {/* Theme toggle + hamburger (mobile) */}
          <div className="flex items-center gap-2 md:hidden">
            {themeToggle}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              className="grid size-9 place-items-center rounded-btn border border-border bg-surface text-fg-muted transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {mobileOpen ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
            </button>
          </div>
          </div>
        </div>

        {/* Mobile navigation panel */}
        {mobileOpen && (
          <nav id="mobile-nav" className="border-t border-border bg-surface px-4 py-3 md:hidden">
            <div className={cx(pageShell, 'space-y-1')}>
              {user && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-fg-muted">
                  <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size="sm" />
                  <span className="truncate">{user.displayName}</span>
                </div>
              )}

              <NavLink to="/" end onClick={closeMobile} className={mobileLinkClass}>
                Stores
              </NavLink>

              {isSuperAdmin && (
                <Link to="/platform/admin" onClick={closeMobile} className={mobileLinkClass}>
                  Platform admin
                </Link>
              )}

              {ownedStores.map((store) => (
                <Link key={store.id} to={`/s/${store.slug}/admin`} onClick={closeMobile} className={mobileLinkClass}>
                  {ownedStores.length === 1 ? 'My store' : `Manage ${store.name}`}
                </Link>
              ))}

              {user && (
                <Link to={storeSlug ? `/s/${storeSlug}/account` : '/account'} onClick={closeMobile} className={mobileLinkClass}>
                  My account
                </Link>
              )}

              {user && storeSlug && (
                <Link to="/account" onClick={closeMobile} className={mobileLinkClass}>
                  Account settings &amp; stores
                </Link>
              )}

              {isStoreOwner && (
                <button
                  type="button"
                  onClick={() => {
                    closeMobile()
                    enterKioskMode()
                  }}
                  className={`${mobileLinkClass} w-full text-left`}
                >
                  Enter kiosk mode
                </button>
              )}

              <div className="mt-2 border-t border-border pt-2">
                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeMobile()
                      logout()
                    }}
                    className={`${mobileLinkClass} w-full text-left`}
                  >
                    Logout
                  </button>
                ) : (
                  <>
                    <Link to="/login" onClick={closeMobile} className={mobileLinkClass}>
                      Sign in
                    </Link>
                    <Link to="/register/customer" onClick={closeMobile} className={mobileLinkClass}>
                      Create customer account
                    </Link>
                    <Link to="/register/owner" onClick={closeMobile} className={mobileLinkClass}>
                      Create owner account
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className={cx(pageShell, 'flex-1', cardDetailMatch || artistBrowseMatch ? 'py-0' : 'py-8')}>
        <Outlet />
      </main>

      {storeSlug && <StoreFooter slug={storeSlug} />}
    </div>
  )
}
