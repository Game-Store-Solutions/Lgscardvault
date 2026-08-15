import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronDown, GalleryHorizontalEnd } from 'lucide-react'
import { cardImage, formatPrice } from '../api/client'
import { useStore, useStoreCases, useStoreTheme } from '../hooks'
import { BackButton, Card, CardBody, EmptyState } from '../components/ui'
import type { StoreSectionCard } from '../api/types'
import { CardImage } from '../components/cards'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { finishName } from '../lib/finishes'
import { CASE_CARDS_LABEL } from './utils/actionsUtil'

/**
 * Storefront Case Cards page (/s/:slug/case-cards). Deliberately restrained:
 * each display case is a clean surface panel in the store's own theme, its
 * sections laid out as responsive grids of lightweight static tiles — no
 * animations, no side-scrolling — so the whole case scans at a glance.
 * Sold-out pool cards, empty sections, and empty cases are hidden.
 */
export default function CaseCardsPage() {
  const { slug = '' } = useParams()
  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const { data: cases, isLoading, isError } = useStoreCases(slug)

  const visibleCases = (cases ?? [])
    .map((storeCase) => ({
      ...storeCase,
      sections: storeCase.sections
        .map((section) => ({
          ...section,
          cards: section.cards.filter(
            (entry): entry is RenderableCard => entry.remaining > 0 && Boolean(entry.inventoryItem.card),
          ),
        }))
        .filter((section) => section.cards.length > 0),
    }))
    .filter((storeCase) => storeCase.sections.length > 0)

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackButton to={`/s/${slug}`}>Back to store</BackButton>

        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg">{CASE_CARDS_LABEL}</h1>
          <div className="mt-2 h-1 w-12 rounded-full bg-brand-500" aria-hidden />
          <p className="mt-3 max-w-xl text-sm text-fg-muted">
            The singles in {store?.name ?? 'the store'}'s display cases. Hand-picked and ready to go.
          </p>
        </div>
      </div>

      {isLoading ? (
        <StorePageLoader label={`Loading ${CASE_CARDS_LABEL.toLowerCase()}…`} />
      ) : isError ? (
        <EmptyState
          icon={GalleryHorizontalEnd}
          title={`Could not load ${CASE_CARDS_LABEL.toLowerCase()}`}
          description="Please try again in a moment."
        />
      ) : visibleCases.length === 0 ? (
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="The cases are being restocked"
          description="This store hasn't featured any cards in its cases yet. Check back soon."
        />
      ) : (
        <div className="space-y-8">
          {visibleCases.map((storeCase) => (
            <Card key={storeCase.id} aria-label={`Display case: ${storeCase.name}`}>
              <CardBody className="space-y-8">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
                  <h2 className="font-display text-xl font-bold tracking-tight text-fg">{storeCase.name}</h2>
                  <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                    {caseCardCount(storeCase.sections)} cards
                  </span>
                </div>

                {storeCase.sections.map((section) => (
                  <CaseSection key={section.id} slug={slug} section={section} />
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One collapsible section inside a case. The whole header row is the toggle
 * so it's an easy touch target; the card count stays visible while collapsed
 * so shoppers know what they're skipping.
 */
function CaseSection({
  slug,
  section,
}: {
  slug: string
  section: { id: number; title: string; cards: RenderableCard[] }
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section>
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="mb-3 flex w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-btn"
      >
        <ChevronDown
          aria-hidden
          className={`size-4 text-brand-600 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
        />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{section.title}</h3>
        <span className="text-xs text-fg-muted">
          {section.cards.length} card{section.cards.length === 1 ? '' : 's'}
        </span>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {section.cards.map((entry) => (
            <CaseCardTile key={entry.id} slug={slug} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}

type RenderableCard = StoreSectionCard & {
  inventoryItem: StoreSectionCard['inventoryItem'] & { card: NonNullable<StoreSectionCard['inventoryItem']['card']> }
}

function caseCardCount(sections: { cards: RenderableCard[] }[]): number {
  return sections.reduce((total, section) => total + section.cards.length, 0)
}

/**
 * One case card: a static, fast tile — lazy image, name, set/finish, price.
 * The only motion is a subtle hover lift. Links to the listing's details.
 */
function CaseCardTile({ slug, entry }: { slug: string; entry: RenderableCard }) {
  const { inventoryItem } = entry
  const card = inventoryItem.card
  const image = cardImage(card)
  const lastOne = entry.remaining === 1

  return (
    <Link
      to={`/s/${slug}/cards/${inventoryItem.id}`}
      state={{ from: 'case-cards' }}
      className="group relative rounded-card transition-transform duration-150 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {lastOne && (
        <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-accent-500 px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-white shadow">
          Last one
        </span>
      )}
      <div className="aspect-[5/7] overflow-hidden rounded-[4.5%/3.5%] bg-bg shadow-card">
        <CardImage src={image} alt={card.name} className="h-full w-full" label={card.name} />
      </div>
      <div className="mt-2 px-0.5">
        <h4 className="truncate text-sm font-bold text-fg group-hover:text-brand-600">{card.name}</h4>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-xs uppercase tracking-wide text-fg-muted">
            {card.setCode?.toUpperCase() ?? '—'}
            {inventoryItem.isFoil ? ` · ${finishName(inventoryItem.card, true, inventoryItem.finish)}` : ''}
          </span>
          <span className="text-sm font-bold text-fg">{formatPrice(inventoryItem.priceCents)}</span>
        </div>
      </div>
    </Link>
  )
}
