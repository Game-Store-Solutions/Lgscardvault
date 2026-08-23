import { useState } from 'react'

import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'

import type { LucideIcon } from 'lucide-react'

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

  Calendar,

  CreditCard,

  ReceiptText,

  RefreshCw,

  Sparkles,

  Store,

  TrendingUp,

  Users,

  Wallet,

  WalletCards,

  X,

} from 'lucide-react'

import { useAuth } from '../../context/AuthContext'

import { APP_CHROME_CLASS, STORE_THEME_CLASS, useOpenStoreOrderCount, usePendingSellSubmissionCount, useStore, useStoreTheme } from '../../hooks'

import { Avatar, BackButton, Button, buttonVariants } from '../ui'

import { ProfileNavBadge } from '../profile'

import { PageTransition } from '../motion'
import { SkipToContent } from './SkipToContent'

import { CASE_CARDS_LABEL } from '../../pages/utils/actionsUtil'



interface NavItem {

  to: string

  label: string

  icon: LucideIcon

  end?: boolean

}



/** A labeled group of nav links; the heading is omitted when null. */

interface NavSection {

  heading: string | null

  items: NavItem[]

}



function useAdminNav(): { context: string; sections: NavSection[] } {

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
            { to: '/platform/admin/patch-notes', label: 'Patch notes', icon: Megaphone },
          ],

        },

      ],

    }

  }



  const slug = params.slug

  const base = slug ? `/s/${slug}/admin` : '/'

  return {

    context: 'Store administration',

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

          { to: `${base}/spotlight`, label: 'Spotlight', icon: Sparkles },

          { to: `${base}/patch-notes`, label: 'Patch notes', icon: Megaphone },
          { to: `${base}/users`, label: 'Users', icon: Users },

        ],

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

  useStoreTheme(store)

  const { data: openOrderCount = 0 } = useOpenStoreOrderCount(params.slug ?? '', Boolean(params.slug))

  const { data: pendingSellCount = 0 } = usePendingSellSubmissionCount(params.slug ?? '', Boolean(params.slug))

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isPlatformAdmin = location.pathname.startsWith('/platform/admin')

  const isStoreAdmin = /\/s\/[^/]+\/admin/.test(location.pathname)

  const fullWidthAdmin = isStoreAdmin && !isPlatformAdmin



  const navLinkClass = ({ isActive }: { isActive: boolean }) =>

    [

      'flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-semibold transition-colors',

      isActive

        // Dark brand-100 ≈ sidebar active fill — pair with text-fg / brand-700, not brand-100.
        ? 'bg-brand-100 text-brand-700 dark:bg-brand-200 dark:text-fg'

        : 'text-fg-muted hover:bg-bg hover:text-fg',

    ].join(' ')



  return (

    <div className="min-h-screen bg-bg text-fg">

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

        className={[

          APP_CHROME_CLASS,

          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border/60 bg-surface shadow-[4px_0_24px_-12px_rgb(28_25_23/0.12)]',

          'transition-transform lg:translate-x-0',

          sidebarOpen ? 'translate-x-0' : '-translate-x-full',

        ].join(' ')}

      >

        <div className="flex h-16 items-center justify-between gap-2 border-b border-border/60 px-4">

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

          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">{context}</p>

          {sections.map((section, index) => (

            <div key={section.heading ?? `group-${index}`} className={index > 0 ? 'mt-3' : undefined}>

              {section.heading && (

                <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-wider text-fg-muted/80">

                  {section.heading}

                </p>

              )}

              <div className="flex flex-col gap-1">

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

                      <Icon aria-hidden className="size-4" />

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



        <div className="border-t border-border/60 p-3">

          <BackButton to="/" tone="soft" className="w-full justify-start rounded-btn px-3 shadow-none">

            Back to public site

          </BackButton>

        </div>

      </aside>



      <div className="lg:pl-64">

        <header className={`${APP_CHROME_CLASS} sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-surface/90 px-4 backdrop-blur-md`}>

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

            <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>

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



        <main

          id="main-content"

          className={

            fullWidthAdmin

              ? `${STORE_THEME_CLASS} w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8`

              : `${STORE_THEME_CLASS} mx-auto max-w-7xl px-4 py-8`

          }

        >

          <PageTransition routeKey={location.pathname}>

            <Outlet />

          </PageTransition>

        </main>

      </div>

    </div>

  )

}


