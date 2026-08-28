import { CheckCircle2, ChevronDown } from 'lucide-react'
import { CardImage } from '../../components/cards'
import { Skeleton } from '../../components/ui'
import { AnimatePresence, EASE_PREMIUM, motion } from '../../components/motion'
import { cx } from '../../lib/cx'
import { DeckBuildConstraintsFields } from './DeckBuildConstraintsFields'
import { colorPips } from './utils'
import type { DeckBuilderState } from './useDeckBuilderState'

type CommanderSidebarProps = Pick<
  DeckBuilderState,
  | 'selected'
  | 'recommend'
  | 'clearCommander'
  | 'constraintsOpen'
  | 'setConstraintsOpen'
  | 'budgetDollars'
  | 'setBudgetDollars'
  | 'maxCardDollars'
  | 'setMaxCardDollars'
  | 'bracket'
  | 'setBracket'
  | 'includeOutOfStock'
  | 'setIncludeOutOfStock'
  | 'resetPicks'
  | 'strategiesQuery'
  | 'strategyId'
  | 'setStrategyId'
  | 'strategiesOpen'
  | 'setStrategiesOpen'
> & {
  showStoreConstraints: boolean
}

export function CommanderSidebar({
  selected,
  recommend,
  clearCommander,
  constraintsOpen,
  setConstraintsOpen,
  budgetDollars,
  setBudgetDollars,
  maxCardDollars,
  setMaxCardDollars,
  bracket,
  setBracket,
  includeOutOfStock,
  setIncludeOutOfStock,
  resetPicks,
  strategiesQuery,
  strategyId,
  setStrategyId,
  strategiesOpen,
  setStrategiesOpen,
  showStoreConstraints,
}: CommanderSidebarProps) {
  if (!selected) return null

  return (
    <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-24 xl:w-[22rem] xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm dark:glass-card">
        <div className="flex gap-3.5 p-4">
          <div className="relative aspect-5/7 w-28 shrink-0 overflow-hidden rounded-md bg-bg shadow-sm sm:w-32">
            <CardImage
              src={selected.imageUrl}
              alt={selected.name}
              fit="contain"
              className="absolute inset-0 size-full"
              showLabel={false}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-extrabold leading-snug text-fg sm:text-lg">
              {selected.name}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
              {selected.typeLine}
            </p>
            <div className="mt-2.5">{colorPips(selected.colorIdentity)}</div>
            {recommend.data?.commander.themes && recommend.data.commander.themes.length > 0 && (
              <p className="mt-2 line-clamp-1 text-[0.7rem] font-medium capitalize text-fg-muted">
                {recommend.data.commander.themes
                  .slice(0, 3)
                  .map((tag) => tag.replaceAll('_', ' '))
                  .join(' · ')}
              </p>
            )}
            <button
              type="button"
              className="mt-2.5 text-sm font-semibold text-brand-600 underline-offset-2 transition-colors hover:text-brand-500 hover:underline"
              onClick={clearCommander}
            >
              Change commander
            </button>
          </div>
        </div>

        {showStoreConstraints && (
          <div className="border-t border-border">
            <button
              type="button"
              aria-expanded={constraintsOpen}
              aria-controls="deck-builder-constraints"
              onClick={() => setConstraintsOpen((open) => !open)}
              className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
                  Build constraints
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
                  {[
                    includeOutOfStock ? 'Out of stock on' : 'In stock only',
                    budgetDollars.trim() ? `Budget $${budgetDollars.trim()}` : null,
                    maxCardDollars.trim() ? `Max $${maxCardDollars.trim()}` : null,
                    bracket !== 'auto' ? `Bracket ${bracket}` : 'Auto bracket',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cx(
                  'mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200',
                  constraintsOpen && 'rotate-180',
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {constraintsOpen && (
                <motion.div
                  id="deck-builder-constraints"
                  key="constraints"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <DeckBuildConstraintsFields
                      budgetDollars={budgetDollars}
                      setBudgetDollars={setBudgetDollars}
                      maxCardDollars={maxCardDollars}
                      setMaxCardDollars={setMaxCardDollars}
                      bracket={bracket}
                      setBracket={setBracket}
                      includeOutOfStock={includeOutOfStock}
                      setIncludeOutOfStock={setIncludeOutOfStock}
                      showOutOfStockToggle
                      onOutOfStockChange={resetPicks}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="min-h-0 overflow-hidden rounded-card border border-border bg-surface shadow-sm">
        <button
          type="button"
          aria-expanded={strategiesOpen}
          aria-controls="deck-builder-strategies"
          onClick={() => setStrategiesOpen((open) => !open)}
          className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg/50"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
              Strategy
            </span>
            <span className="mt-1 block text-sm font-semibold text-fg">
              {strategiesQuery.data?.find((s) => s.id === strategyId)?.label ??
                (strategiesQuery.isLoading ? 'Loading strategies…' : 'Pick a strategy')}
            </span>
            {strategyId && (
              <span className="mt-0.5 block text-xs text-fg-muted">
                Tap to {strategiesOpen ? 'hide' : 'change'} strategies
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={cx(
              'mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200',
              strategiesOpen && 'rotate-180',
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {strategiesOpen && (
            <motion.div
              id="deck-builder-strategies"
              key="strategies"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE_PREMIUM }}
              className="overflow-hidden border-t border-border"
            >
              <div className="max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:max-h-[min(32rem,calc(100vh-18rem))]">
                {strategiesQuery.isLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                )}
                <div className="space-y-2">
                  {(strategiesQuery.data ?? []).map((strategy) => {
                    const active = strategyId === strategy.id
                    const confidence = Math.round(strategy.confidence * 100)
                    return (
                      <button
                        key={strategy.id}
                        type="button"
                        onClick={() => {
                          setStrategyId(strategy.id)
                          resetPicks()
                          if (
                            typeof window !== 'undefined' &&
                            !window.matchMedia('(min-width: 1280px)').matches
                          ) {
                            setStrategiesOpen(false)
                          }
                        }}
                        className={cx(
                          'w-full rounded-card border px-3.5 py-3 text-left transition-all duration-200',
                          active
                            ? 'border-brand-400 bg-brand-50/70 shadow-sm dark:bg-brand-500/12'
                            : 'border-border bg-bg/40 hover:border-brand-300/70',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-fg">{strategy.label}</p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {active ? (
                              <CheckCircle2 aria-hidden className="size-4 text-brand-600" />
                            ) : (
                              <span className="text-[0.65rem] font-bold tabular-nums text-fg-muted">
                                {confidence}%
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                          {strategy.description}
                        </p>
                        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-bg">
                          <div
                            className={cx(
                              'h-full rounded-full transition-all duration-500',
                              active ? 'bg-brand-500' : 'bg-fg-muted/35',
                            )}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
