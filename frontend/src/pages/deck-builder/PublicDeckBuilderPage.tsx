import { Link } from 'react-router'
import { Crown, Layers, Sparkles, Wand2 } from 'lucide-react'
import { BackButton, Tabs, TabPanel } from '../../components/ui'
import { CardArtLightbox } from '../../components/cards'
import { useAppShellFlush } from '../../components/layout/AppShellLayout'
import { usePageMeta, useJsonLd } from '../../hooks/usePageMeta'
import { ShareButton } from '../../components/ShareButton'
import { cx } from '../../lib/cx'
import { CommanderSearchField } from './CommanderSearchField'
import { CommanderSearchGrid } from './CommanderSearchGrid'
import { CommanderSidebar } from './CommanderSidebar'
import { PUBLIC_ONBOARDING_STEPS } from './constants'
import { PublicCombosPanel } from './PublicCombosPanel'
import { PublicDeckPanel } from './PublicDeckPanel'
import { PublicSynergyPanel } from './PublicSynergyPanel'
import { useDeckBuilderState } from './useDeckBuilderState'

export default function PublicDeckBuilderPage() {
  const state = useDeckBuilderState('public')
  useAppShellFlush(true)

  usePageMeta({
    title: 'Commander Deck Builder',
    description:
      'Build a 100-card Commander deck with strategy-aware recommendations, Spellbook combos, and mana-curve analysis.',
    path: '/tools/deck-builder',
  })

  useJsonLd('deck-builder-faq', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is the Commander deck builder free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The public deck builder on LGS Card Vault is free and does not require a store account.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does it work without a local game store?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Recommendations come from the full Magic catalog. Visit a store on LGS Card Vault when you are ready to buy cards.',
        },
      },
    ],
  })

  const {
    selected,
    query,
    handleQueryChange,
    search,
    showSearchGrid,
    searchResults,
    pickCommander,
    panel,
    setPanel,
    cardPreview,
    setCardPreview,
    recommend,
    combos,
    budgetDollars,
    setBudgetDollars,
    maxCardDollars,
    setMaxCardDollars,
    bracket,
    setBracket,
    constraintsOpen,
    setConstraintsOpen,
    groupBy,
    setGroupBy,
    deck,
    openCardPreview,
  } = state

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col">
      {selected ? (
        <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BackButton to="/">Home</BackButton>
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
        <div className="relative mx-auto w-full max-w-5xl px-6 pt-4 sm:px-8 sm:pt-6 lg:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-brand-500)_18%,transparent),transparent_62%)]"
          />
          <header className="relative">
            <BackButton to="/">Home</BackButton>
            <p className="mt-8 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-brand-600">
              <Crown aria-hidden className="size-3.5" />
              Commander
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
              Commander Deck Builder
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              Want to buy cards too?{' '}
              <Link to="/stores" className="font-semibold text-brand-600 hover:text-brand-500">
                Browse local game stores
              </Link>
              .
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ShareButton
                url="/tools/deck-builder"
                title="Commander Deck Builder"
                text="Build a strategy-aware Commander deck with combos on LGS Card Vault."
                label="Share deck builder"
              />
            </div>
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
          selected
            ? 'gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:flex-row xl:items-start'
            : 'mx-auto w-full max-w-5xl px-6 pb-16 pt-10 sm:px-8 lg:px-10',
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
            {PUBLIC_ONBOARDING_STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-card border border-border/80 bg-surface/80 px-6 py-7 dark:glass-card"
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
            <CommanderSidebar {...state} showStoreConstraints={false} />
            <div className="min-w-0 flex-1">
              <Tabs
                aria-label="Deck builder views"
                value={panel}
                onChange={(id) => setPanel(id as typeof panel)}
                tabs={[
                  { id: 'synergy', label: 'Synergies', icon: Sparkles },
                  { id: 'combos', label: 'Combos', icon: Wand2 },
                  { id: 'deck', label: '100-card deck', icon: Layers },
                ]}
              />
              <TabPanel when="synergy" value={panel} className="pt-5">
                <PublicSynergyPanel {...state} />
              </TabPanel>
              <TabPanel when="combos" value={panel} className="pt-5">
                <PublicCombosPanel
                  loading={combos.isLoading}
                  combos={combos.data?.combos ?? []}
                  identityCode={combos.data?.identityCode ?? recommend.data?.identityCode}
                  colorIdentity={combos.data?.colorIdentity ?? selected.colorIdentity}
                  filteredOutCount={combos.data?.filteredOutCount ?? 0}
                />
              </TabPanel>
              <TabPanel when="deck" value={panel} className="pt-5">
                <PublicDeckPanel
                  loading={deck.isLoading}
                  deck={deck.data}
                  budgetDollars={budgetDollars}
                  setBudgetDollars={setBudgetDollars}
                  maxCardDollars={maxCardDollars}
                  setMaxCardDollars={setMaxCardDollars}
                  bracket={bracket}
                  setBracket={setBracket}
                  constraintsOpen={constraintsOpen}
                  setConstraintsOpen={setConstraintsOpen}
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
