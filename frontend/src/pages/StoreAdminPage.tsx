import { Link, useParams } from 'react-router'
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
import SealedTab from './store-admin/SealedTab'

type Section = 'inventory' | 'sealed' | 'branding' | 'spotlight' | 'case-cards' | 'payments' | 'orders' | 'reports' | 'csv' | 'patch-notes' | 'sell-trade'

const SECTIONS: Record<Section, { label: string; render: (slug: string) => React.ReactNode }> = {
  inventory: { label: 'Singles', render: (slug) => <SearchTab slug={slug} /> },
  sealed: { label: 'Sealed', render: (slug) => <SealedTab slug={slug} /> },
  branding: { label: 'Branding', render: (slug) => <BrandingTab slug={slug} /> },
  spotlight: { label: 'Spotlight', render: (slug) => <SpotlightTab slug={slug} /> },
  'case-cards': { label: 'Case cards', render: (slug) => <CaseCardsTab slug={slug} /> },
  payments: { label: 'Payments', render: (slug) => <PaymentsTab slug={slug} /> },
  orders: { label: 'Orders', render: (slug) => <OrdersTab slug={slug} /> },
  reports: { label: 'Reports', render: (slug) => <ReportsTab slug={slug} /> },
  csv: { label: 'Imports', render: (slug) => <CsvTab slug={slug} /> },
  'sell-trade': { label: 'Sell / Trade', render: (slug) => <SellTradeTab slug={slug} /> },
  'patch-notes': { label: 'Patch notes', render: () => <PatchNotesTab /> },
}

function resolveSection(value?: string): Section {
  return value && value in SECTIONS ? (value as Section) : 'inventory'
}

export default function StoreAdminPage() {
  const { slug = '', section } = useParams()
  const active = resolveSection(section)
  const { data: store } = useStore(slug)

  return (
    <div className="space-y-6">
      <PageHeader
        title={store?.name ?? slug}
        subtitle={`${SECTIONS[active].label}${store?.slug ? ` · /${store.slug}` : ''}`}
        actions={
          <Link to={`/s/${slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            View storefront
          </Link>
        }
      />

      {/* Only the active section is mounted, so heavy-polling sections (CSV, Reports)
          don't fire queries/intervals until selected. */}
      {SECTIONS[active].render(slug)}
    </div>
  )
}
