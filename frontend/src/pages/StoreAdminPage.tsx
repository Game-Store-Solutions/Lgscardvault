import { Link, useLocation, useParams } from 'react-router'
import { ArrowUpRight, BadgeCheck, ExternalLink, Store as StoreIcon } from 'lucide-react'
import { buttonVariants } from '../components/ui'
import { Reveal } from '../components/motion'
import { useStore } from '../hooks'
import { storeAccent } from '../lib/storeAccent'
import SearchTab from './store-admin/SearchTab'
import OrdersTab from './store-admin/OrdersTab'
import CsvTab from './store-admin/CsvTab'
import ReportsTab from './store-admin/ReportsTab'
import SpotlightTab from './store-admin/SpotlightTab'
import CaseCardsTab from './store-admin/CaseCardsTab'
import BrandingTab from './store-admin/BrandingTab'
import PaymentsTab from './store-admin/PaymentsTab'
import PatchNotesTab from './store-admin/PatchNotesTab'
import SellTradeTab from './store-admin/SellTradeTab'
import StoreCreditTab from './store-admin/StoreCreditTab'
import SealedTab from './store-admin/SealedTab'
import EventsTab from './store-admin/EventsTab'
import TeamTab from './store-admin/TeamTab'
import { CASE_CARDS_LABEL } from './utils/actionsUtil'

type Section = 'inventory' | 'sealed' | 'branding' | 'spotlight' | 'case-cards' | 'payments' | 'orders' | 'reports' | 'csv' | 'patch-notes' | 'sell-trade' | 'store-credit' | 'events' | 'users'

const SECTIONS: Record<Section, { label: string; hint: string; render: (slug: string) => React.ReactNode }> = {
  inventory: { label: 'Singles', hint: 'Search, price, and manage single-card listings.', render: (slug) => <SearchTab slug={slug} /> },
  sealed: { label: 'Sealed', hint: 'Stock and price sealed product.', render: (slug) => <SealedTab slug={slug} /> },
  branding: { label: 'Branding', hint: 'Storefront identity, colors, and footer details.', render: (slug) => <BrandingTab slug={slug} /> },
  spotlight: { label: 'Spotlight', hint: 'Choose which premium singles headline your storefront.', render: (slug) => <SpotlightTab slug={slug} /> },
  'case-cards': { label: CASE_CARDS_LABEL, hint: 'Organise the physical display case and its pull sheets.', render: (slug) => <CaseCardsTab slug={slug} /> },
  payments: { label: 'Payments', hint: 'Connect and monitor checkout payments.', render: (slug) => <PaymentsTab slug={slug} /> },
  orders: { label: 'Orders', hint: 'Fulfil customer orders and pickups.', render: (slug) => <OrdersTab slug={slug} /> },
  reports: { label: 'Reports', hint: 'Sales performance and inventory movement.', render: (slug) => <ReportsTab slug={slug} /> },
  csv: { label: 'Imports', hint: 'Bulk import inventory and review past runs.', render: (slug) => <CsvTab slug={slug} /> },
  'sell-trade': { label: 'Sell / Trade', hint: 'Review customer buylist and trade submissions.', render: (slug) => <SellTradeTab slug={slug} /> },
  'store-credit': { label: 'Store credit', hint: 'Issue and track customer store credit.', render: (slug) => <StoreCreditTab slug={slug} /> },
  'patch-notes': { label: 'Patch notes', hint: 'What changed recently on the platform.', render: () => <PatchNotesTab /> },
  events: { label: 'Events', hint: 'Publish the community event calendar.', render: (slug) => <EventsTab slug={slug} /> },
  users: { label: 'Users', hint: 'Manage staff access for this store.', render: (slug) => <TeamTab slug={slug} /> },
}

function resolveSection(value?: string): Section {
  return value && value in SECTIONS ? (value as Section) : 'inventory'
}

export default function StoreAdminPage() {
  const { slug = '', section } = useParams()
  const location = useLocation()
  const active = resolveSection(section)
  const { data: store } = useStore(slug)
  // Orders ships its own full-width header/toolbar, so skip the page chrome.
  const hidePageHeader = active === 'orders'
  const accent = storeAccent(0, store?.primaryColor)
  const approved = store?.status === 'approved'

  return (
    <div key={location.pathname} className={hidePageHeader ? '' : 'space-y-6'}>
      {!hidePageHeader && (
        <Reveal
          immediate
          y={10}
          className="overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]"
        >
          <span aria-hidden className="block h-1 w-full" style={{ backgroundColor: accent }} />
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-bg dark:border-white/10 dark:bg-white/[0.04]"
                style={{ color: accent }}
              >
                {store?.logoUrl?.trim() ? (
                  <img src={store.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <StoreIcon aria-hidden className="size-5" />
                )}
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                    {store?.name ?? slug}
                  </h1>
                  {approved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-success-700">
                      <BadgeCheck aria-hidden className="size-3" />
                      Live
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-fg-muted">
                  <span className="font-semibold text-fg">{SECTIONS[active].label}</span>
                  {store?.slug ? ` · /${store.slug}` : ''}
                </p>
                <p className="mt-1 hidden text-sm leading-relaxed text-fg-muted sm:block">{SECTIONS[active].hint}</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                to={`/s/${slug}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <ExternalLink aria-hidden className="size-4" />
                View storefront
              </Link>
              <Link
                to={`/s/${slug}/admin/reports`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Reports
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      )}

      {SECTIONS[active].render(slug)}
    </div>
  )
}
