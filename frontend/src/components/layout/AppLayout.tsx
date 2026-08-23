import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useCustomerCart, useGuestCart, useKioskMode, useTheme, APP_CHROME_CLASS, STORE_THEME_CLASS } from '../../hooks'
import { StorefrontBackground } from '../store/backgrounds'
import { NotificationBell } from '../notifications/NotificationBell'
import { StoreFooter } from '../store/StoreFooter'
import { LegalLinks } from '../legal/LegalLinks'
import { Avatar, Button, buttonVariants, dropdownItemClass, dropdownPanelClass } from '../ui'
import { BrandLogo } from '../BrandLogo'
import { DEFAULT_APP_SHELL, FLUSH_APP_SHELL, FULL_WIDTH_APP_SHELL, STOREFRONT_SHELL } from '../../lib/layoutShell'
import { manageableStores } from '../../lib/manageableStores'
import { AppShellLayoutProvider, useAppShellLayout } from './AppShellLayout'
import { SkipToContent } from './SkipToContent'
import { PageTransition, EASE_PREMIUM } from '../motion'
import { motion } from 'framer-motion'
import { cx } from '../../lib/cx'
import { ChevronDown, LogIn, LogOut, Menu, Monitor, Moon, ShieldCheck, ShoppingCart, Store, Sun, UserCircle, UserPlus, X } from 'lucide-react'

/** Sections rendered by the guest landing page, in page order. */
const LANDING_SECTIONS = [
  { id: 'games', label: 'Games' },
  { id: 'contact', label: 'Contact' },
] as const

export default function AppLayout() {
  const { user, logout, isSuperAdmin, isStoreOwner } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { kioskMode, enterKioskMode, exitKioskMode } = useKioskMode()
  const ownedStores = manageableStores(user)
  // The customer profile + cart are per-store, so only surface those links when
  // the current route is within a store (e.g. /s/:slug, /s/:slug/cards/:id).
  const storeMatch = useMatch('/s/:slug/*')
  const exactStoreMatch = useMatch('/s/:slug')
  const accountMatch = useMatch({ path: '/account', end: false })
  const storeAccountMatch = useMatch('/s/:slug/account')
  const storeSlug = storeMatch?.params.slug ?? exactStoreMatch?.params.slug
  const fullWidthAccount = Boolean(accountMatch || storeAccountMatch)
  const headerShell = fullWidthAccount
    ? FULL_WIDTH_APP_SHELL
    : storeSlug
      ? STOREFRONT_SHELL
      : DEFAULT_APP_SHELL
  // Live cart count for the active store, so the navbar badge stays in sync.
  const { data: authedCart = [] } = useCustomerCart(storeSlug ?? '', Boolean(user && storeSlug))
  const { query: guestCartQuery } = useGuestCart(storeSlug ?? '', Boolean(!user && storeSlug))
  const guestCart = guestCartQuery.data ?? []
  const cart = user ? authedCart : guestCart
  const cartCount = cart.reduce((total: number, entry) => total + entry.quantity, 0)
  const cartBadge = cartCount > 99 ? '99+' : String(cartCount)
  const location = useLocation()
  // Section links only make sense on the guest landing page, where those
  // sections actually exist. Everywhere else the header stays logo + actions.
  const onLandingPage = location.pathname === '/' && !user
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

  /** Landing-only in-page navigation. Smooth-scrolls to the real sections. */
  const landingLinks = LANDING_SECTIONS.map(({ id, label }) => (
    <a
      key={id}
      href={`#${id}`}
      className="rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-bg hover:text-fg"
    >
      {label}
    </a>
  ))

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
      <AppShellLayoutProvider>
        <div className="flex min-h-screen flex-col bg-bg text-fg">
          <SkipToContent />
          <header className={cx(APP_CHROME_CLASS, 'sticky top-0 z-40 border-b border-border/60 bg-surface/85 shadow-sm backdrop-blur-xl')}>
            <div className={cx(headerShell, 'flex items-center justify-between gap-4 py-3')}>
              <span className="flex items-center gap-2">
                <BrandLogo size="md" />
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

          <div className={cx(STORE_THEME_CLASS, 'relative flex min-h-0 flex-1 flex-col bg-bg text-fg')}>
            {storeSlug && <StorefrontBackground slug={storeSlug} />}
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
              <AppMain contentShell={headerShell} />
              {storeSlug ? <StoreFooter slug={storeSlug} /> : <MarketplaceLegalFooter />}
            </div>
          </div>
        </div>
      </AppShellLayoutProvider>
    )
  }

  return (
    <AppShellLayoutProvider>
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <SkipToContent />
      <header className={cx(APP_CHROME_CLASS, 'sticky top-0 z-40 border-b border-border/60 bg-surface/85 shadow-sm backdrop-blur-xl')}>
        <div className={cx(headerShell, 'flex items-center justify-between gap-4 py-3')}>
          <BrandLogo size="md" withWordmark />

          <div className="flex items-center gap-3">
          {/* Desktop navigation */}
          <nav className="hidden items-center gap-3 md:flex">
            {onLandingPage && <div className="flex items-center gap-1">{landingLinks}</div>}

            {user && (
              <NavLink to="/" className={navLinkClass} end>
                Stores
              </NavLink>
            )}

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
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                    className={cx(dropdownPanelClass, 'absolute right-0 z-20 mt-2 min-w-56 p-1.5')}
                  >
                    {ownedStores.map((store) => (
                      <Link
                        key={store.id}
                        role="menuitem"
                        to={`/s/${store.slug}/admin`}
                        onClick={() => setStoreMenuOpen(false)}
                        className={dropdownItemClass({})}
                      >
                        {store.name}
                      </Link>
                    ))}
                  </motion.div>
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
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                    className={cx(dropdownPanelClass, 'absolute right-0 z-20 mt-2 w-56 p-1.5')}
                  >
                    <div className="border-b border-border px-2.5 pb-2 pt-1.5 dark:border-white/10">
                      <p className="truncate text-sm font-bold text-fg">{user.displayName}</p>
                      <p className="truncate text-xs text-fg-muted">{user.email}</p>
                    </div>
                    <Link
                      role="menuitem"
                      to={storeSlug ? `/account?store=${storeSlug}` : '/account'}
                      onClick={() => setUserMenuOpen(false)}
                      className={cx(dropdownItemClass({}), 'mt-1')}
                    >
                      <UserCircle aria-hidden className="size-4 text-fg-muted" />
                      My account
                    </Link>
                    {/* Kiosk terminals belong to stores: their owners flip the mode. */}
                    {isStoreOwner && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false)
                          enterKioskMode()
                        }}
                        className={dropdownItemClass({})}
                      >
                        <Monitor aria-hidden className="size-4 text-fg-muted" />
                        Enter kiosk mode
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                      className={cx(dropdownItemClass({}), 'text-danger-700 hover:text-danger-700')}
                    >
                      <LogOut aria-hidden className="size-4" />
                      Logout
                    </button>
                  </motion.div>
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
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.16, ease: EASE_PREMIUM }}
                      className={cx(dropdownPanelClass, 'absolute right-0 z-20 mt-2 w-48 p-1.5')}
                    >
                      <Link
                        role="menuitem"
                        to="/register/customer"
                        onClick={() => setAccountMenuOpen(false)}
                        className={dropdownItemClass({})}
                      >
                        Shopper
                      </Link>
                      <Link
                        role="menuitem"
                        to="/register/owner"
                        onClick={() => setAccountMenuOpen(false)}
                        className={dropdownItemClass({})}
                      >
                        Owner
                      </Link>
                    </motion.div>
                  )}
                </div>
              </>
            )}
          </nav>

          {/* Cart. Always visible top-right when inside a store */}
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
            <div className={cx(headerShell, 'space-y-1')}>
              {user && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-fg-muted">
                  <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size="sm" />
                  <span className="truncate">{user.displayName}</span>
                </div>
              )}

              {onLandingPage &&
                LANDING_SECTIONS.map(({ id, label }) => (
                  <a key={id} href={`#${id}`} onClick={closeMobile} className={mobileLinkClass}>
                    {label}
                  </a>
                ))}

              {user && (
                <NavLink to="/" end onClick={closeMobile} className={mobileLinkClass}>
                  Stores
                </NavLink>
              )}

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
                <Link to={storeSlug ? `/account?store=${storeSlug}` : '/account'} onClick={closeMobile} className={mobileLinkClass}>
                  My account
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
                      Create shopper account
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

      <div className={cx(STORE_THEME_CLASS, 'relative flex min-h-0 flex-1 flex-col bg-bg text-fg')}>
        {storeSlug && <StorefrontBackground slug={storeSlug} />}
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <AppMain contentShell={headerShell} />
          {storeSlug ? <StoreFooter slug={storeSlug} /> : <MarketplaceLegalFooter />}
        </div>
      </div>
    </div>
    </AppShellLayoutProvider>
  )
}

function AppMain({ contentShell }: { contentShell: string }) {
  const layout = useAppShellLayout()
  const flush = layout?.flushMain ?? false
  const location = useLocation()

  return (
    <main id="main-content" className={cx(flush ? FLUSH_APP_SHELL : contentShell, 'flex-1', flush ? 'py-0' : 'py-5 sm:py-8')}>
      <PageTransition routeKey={location.pathname}>
        <Outlet />
      </PageTransition>
    </main>
  )
}

function MarketplaceLegalFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className={cx(DEFAULT_APP_SHELL, 'flex flex-wrap items-center justify-between gap-3 py-5')}>
        <p className="text-xs text-fg-muted">LGS Card Vault · US stores · pickup only</p>
        <LegalLinks compact />
      </div>
    </footer>
  )
}
