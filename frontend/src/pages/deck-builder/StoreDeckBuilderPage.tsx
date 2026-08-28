import { Crown } from 'lucide-react'
import { BackButton, Tabs, TabPanel } from '../../components/ui'
import { CardArtLightbox } from '../../components/cards'
import { StorePageLoader } from '../../components/store/StorePageLoader'
import { useStoreTheme } from '../../hooks'
import { useAppShellFlush } from '../../components/layout/AppShellLayout'
import { usePageMeta } from '../../hooks/usePageMeta'
import { cx } from '../../lib/cx'
import { CommanderSearchField } from './CommanderSearchField'
import { CommanderSearchGrid } from './CommanderSearchGrid'
import { CommanderSidebar } from './CommanderSidebar'
import { STORE_ONBOARDING_STEPS } from './constants'
import { DECK_BUILDER_TABS } from './deckBuilderTabs'
import {
  DECK_BUILDER_CONTENT_SHELL,
  DECK_BUILDER_HEADER,
  DECK_BUILDER_LANDING_SHELL,
  DECK_BUILDER_ONBOARDING_SHELL,
  DECK_BUILDER_PAGE,
} from './layoutClasses'
import { StoreCombosPanel } from './StoreCombosPanel'
import { StoreDeckPanel } from './StoreDeckPanel'
import { StoreSynergyPanel } from './StoreSynergyPanel'
import { useDeckBuilderState } from './useDeckBuilderState'

export default function StoreDeckBuilderPage() {
  const state = useDeckBuilderState('store')
  const { routeSlug, store, storeLoading, selected, query, handleQueryChange, search, showSearchGrid, searchResults, pickCommander, panel, setPanel, recommend, combos, deck, signedIn, cartQtyByInventoryId, addOne, cart, deckBusy, addDeckToCart, cardLinkState, cardPreview, setCardPreview, openCardPreview, groupBy, setGroupBy } = state

  useStoreTheme(store)
  useAppShellFlush(true)

  usePageMeta({
    title: 'Deck Builder',
    description: "Search commanders, pick a strategy, and fill your deck from this store's in-stock singles.",
    path: `/s/${routeSlug}/deck-builder`,
  })

  if (storeLoading || !store) {
    return <StorePageLoader />
  }

  return (
    <div className={DECK_BUILDER_PAGE}>
      {selected ? (
        <header className={DECK_BUILDER_HEADER}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BackButton to={`/s/${routeSlug}`}>Back</BackButton>
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-brand-600">
                  Deck builder
                </p>
                <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-fg">
                  {selected.name}
                </h1>
              </div>
            </div>
            <CommanderSearchField
              value={query}
              onChange={handleQueryChange}
              fetching={search.isFetching}
              compact
            />
          </div>
        </header>
      ) : (
        <div className={DECK_BUILDER_LANDING_SHELL}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-brand-500)_18%,transparent),transparent_62%)]"
          />
          <header className="relative">
            <BackButton to={`/s/${routeSlug}`}>Back to store</BackButton>
            <p className="mt-8 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-brand-600">
              <Crown aria-hidden className="size-3.5" />
              Commander
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
              Deck Builder
            </h1>
            <p className="mt-3 max-w-lg text-base leading-7 text-fg-muted">
              Search a legal commander, pick a strategy, then add this store&apos;s in-stock cards grouped
              by role or type.
            </p>
            <div className="mt-8">
              <CommanderSearchField
                value={query}
                onChange={handleQueryChange}
                fetching={search.isFetching}
                autoFocus
              />
            </div>
          </header>
        </div>
      )}

      <section
        className={cx(
          'flex flex-1 flex-col',
          selected ? DECK_BUILDER_CONTENT_SHELL : DECK_BUILDER_ONBOARDING_SHELL,
        )}
      >
        {showSearchGrid ? (
          <CommanderSearchGrid
            searchResults={searchResults}
            fetching={search.isFetching}
            pickCommander={pickCommander}
          />
        ) : !selected ? (
          <div className="grid gap-5 sm:grid-cols-3">
            {STORE_ONBOARDING_STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-card border border-border/80 bg-surface/80 px-4 py-6 dark:glass-card sm:px-6 sm:py-7"
              >
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-brand-600">
                  {item.step}
                </p>
                <p className="mt-3 font-display text-lg font-extrabold leading-snug text-fg">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{item.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <CommanderSidebar {...state} showStoreConstraints />
            <div className="min-w-0 flex-1">
              <Tabs
                aria-label="Deck builder views"
                value={panel}
                onChange={(id) => setPanel(id as typeof panel)}
                tabs={DECK_BUILDER_TABS}
              />
              <TabPanel when="synergy" value={panel} className="pt-5">
                <StoreSynergyPanel {...state} />
              </TabPanel>
              <TabPanel when="combos" value={panel} className="pt-5">
                <StoreCombosPanel
                  slug={routeSlug}
                  loading={combos.isLoading}
                  combos={combos.data?.combos ?? []}
                  identityCode={combos.data?.identityCode ?? recommend.data?.identityCode}
                  colorIdentity={combos.data?.colorIdentity ?? selected.colorIdentity}
                  filteredOutCount={combos.data?.filteredOutCount ?? 0}
                  signedIn={signedIn}
                  cartQtyByInventoryId={cartQtyByInventoryId}
                  onAdd={(item) => void addOne(item)}
                  cartPending={cart.setItem.isPending}
                  linkState={cardLinkState}
                />
              </TabPanel>
              <TabPanel when="deck" value={panel} className="pt-5">
                <StoreDeckPanel
                  slug={routeSlug}
                  loading={deck.isLoading}
                  deck={deck.data}
                  signedIn={signedIn}
                  busy={deckBusy}
                  onAddAll={addDeckToCart}
                  groupBy={groupBy}
                  setGroupBy={setGroupBy}
                  onOpenCardPreview={openCardPreview}
                />
              </TabPanel>
            </div>
          </>
        )}
      </section>

      {cardPreview && (
        <CardArtLightbox
          cards={cardPreview.cards}
          index={cardPreview.index}
          onClose={() => setCardPreview(null)}
          onIndexChange={(index) => setCardPreview((prev) => (prev ? { ...prev, index } : null))}
        />
      )}
    </div>
  )
}
