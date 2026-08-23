import { Link, useLocation, useParams } from 'react-router'
import { buttonVariants, PageHeader } from '../components/ui'
import { useStore } from '../hooks'
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
import TrainingTab from './store-admin/TrainingTab'
import { CASE_CARDS_LABEL } from './utils/actionsUtil'

type Section = 'inventory' | 'sealed' | 'branding' | 'spotlight' | 'case-cards' | 'payments' | 'orders' | 'reports' | 'csv' | 'patch-notes' | 'sell-trade' | 'store-credit' | 'events' | 'users' | 'training'

const SECTIONS: Record<Section, { label: string; render: (slug: string) => React.ReactNode }> = {
  inventory: { label: 'Singles', render: (slug) => <SearchTab slug={slug} /> },
  sealed: { label: 'Sealed', render: (slug) => <SealedTab slug={slug} /> },
  branding: { label: 'Branding', render: (slug) => <BrandingTab slug={slug} /> },
  spotlight: { label: 'Spotlight', render: (slug) => <SpotlightTab slug={slug} /> },
  'case-cards': { label: CASE_CARDS_LABEL, render: (slug) => <CaseCardsTab slug={slug} /> },
  payments: { label: 'Payments', render: (slug) => <PaymentsTab slug={slug} /> },
  orders: { label: 'Orders', render: (slug) => <OrdersTab slug={slug} /> },
  reports: { label: 'Reports', render: (slug) => <ReportsTab slug={slug} /> },
  csv: { label: 'Imports', render: (slug) => <CsvTab slug={slug} /> },
  'sell-trade': { label: 'Sell / Trade', render: (slug) => <SellTradeTab slug={slug} /> },
  'store-credit': { label: 'Store credit', render: (slug) => <StoreCreditTab slug={slug} /> },
  'patch-notes': { label: 'Patch notes', render: () => <PatchNotesTab /> },
  events: { label: 'Events', render: (slug) => <EventsTab slug={slug} /> },
  users: { label: 'Users', render: (slug) => <TeamTab slug={slug} /> },
  training: { label: 'Training', render: (slug) => <TrainingTab slug={slug} /> },
}

function resolveSection(value?: string): Section {
  return value && value in SECTIONS ? (value as Section) : 'inventory'
}

export default function StoreAdminPage() {
  const { slug = '', section } = useParams()
  const location = useLocation()
  const active = resolveSection(section)
  const { data: store } = useStore(slug)
  const hidePageHeader = active === 'orders'

  return (
    <div key={location.pathname} className={hidePageHeader ? '' : 'space-y-6'}>
      {!hidePageHeader && (
        <PageHeader
          title={store?.name ?? slug}
          subtitle={`${SECTIONS[active].label}${store?.slug ? ` · /${store.slug}` : ''}`}
          actions={
            <Link to={`/s/${slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              View storefront
            </Link>
          }
        />
      )}

      {SECTIONS[active].render(slug)}
    </div>
  )
}
