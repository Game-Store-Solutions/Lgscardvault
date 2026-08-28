import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { formatPrice } from '../../api/client'
import type { AssembledDeckResponse } from '../../hooks'
import type { DeckBuilderGroupBy } from '../../lib/deckBuilder'
import { buttonVariants, LoadingPanel } from '../../components/ui'
import { AnimatePresence, EASE_PREMIUM, motion } from '../../components/motion'
import { type CardArtPreview } from '../../components/cards'
import { cx } from '../../lib/cx'
import type { CardPrintingSelection } from '../../lib/cardPreview'
import { DeckListBody } from './deck/DeckListBody'
import { DeckBuildConstraintsFields } from './DeckBuildConstraintsFields'
import { GroupBySwitcher } from './GroupBySwitcher'
import type { DeckBracket } from './utils'

function partitionDeckGaps(gaps: string[]) {
  const structural: string[] = []
  const advisory: string[] = []

  for (const gap of gaps) {
    if (gap.startsWith('Short ') || gap.startsWith('Deck short')) {
      structural.push(gap)
    } else {
      advisory.push(gap)
    }
  }

  return { structural, advisory }
}

export function PublicDeckPanel({
  loading,
  deck,
  budgetDollars,
  setBudgetDollars,
  maxCardDollars,
  setMaxCardDollars,
  bracket,
  setBracket,
  constraintsOpen = false,
  setConstraintsOpen,
  groupBy,
  setGroupBy,
  onOpenCardPreview,
  getPrintingSelection,
  catalogDeckTotalCents,
}: {
  loading: boolean
  deck: AssembledDeckResponse | undefined
  budgetDollars: string
  setBudgetDollars: Dispatch<SetStateAction<string>>
  maxCardDollars: string
  setMaxCardDollars: Dispatch<SetStateAction<string>>
  bracket: DeckBracket
  setBracket: Dispatch<SetStateAction<DeckBracket>>
  constraintsOpen?: boolean
  setConstraintsOpen: Dispatch<SetStateAction<boolean>>
  groupBy: DeckBuilderGroupBy
  setGroupBy: Dispatch<SetStateAction<DeckBuilderGroupBy>>
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
  catalogDeckTotalCents?: number | null
}) {
  if (loading || !deck) {
    return <LoadingPanel label="Assembling your Commander deck…" />
  }

  const slotEntries = Object.entries(deck.slots).filter(
    ([key, count]) => key !== 'commander' && Number(count) > 0,
  )
  const structure = deck.structure?.actual ?? {}
  const targets = deck.structure?.targets ?? {}
  const visibleCards = deck.cards
  const isDeckComplete = deck.filledSize >= deck.targetSize
  const { structural: structuralGaps, advisory: advisoryGaps } = partitionDeckGaps(deck.gaps)
  const priceCents = catalogDeckTotalCents ?? deck.budget.spentCents
  const budgetLimitCents = deck.budget.limitCents
  const isOverBudget =
    budgetLimitCents != null && priceCents != null && priceCents > budgetLimitCents
  const overBudgetCents = isOverBudget ? priceCents - budgetLimitCents : 0
  const structureRoles = ['lands', 'ramp', 'draw', 'removal'] as const

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
        <button
          type="button"
          aria-expanded={constraintsOpen}
          aria-controls="deck-builder-deck-constraints"
          onClick={() => setConstraintsOpen((open) => !open)}
          className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg/50"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
              Build constraints
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
              {[
                budgetDollars.trim() ? `Budget $${budgetDollars.trim()}` : null,
                maxCardDollars.trim() ? `Max $${maxCardDollars.trim()}` : null,
                bracket !== 'auto' ? `Bracket ${bracket}` : 'Auto bracket',
              ]
                .filter(Boolean)
                .join(' · ') || 'Budget, card cap, and bracket for the 100-card list'}
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
              id="deck-builder-deck-constraints"
              key="deck-constraints"
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
                  includeOutOfStock
                  setIncludeOutOfStock={() => {}}
                  showOutOfStockToggle={false}
                  catalogMode
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="rounded-card border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <p
              className={cx(
                'font-display font-extrabold text-fg',
                isDeckComplete ? 'text-lg sm:text-xl' : 'text-base',
              )}
            >
              {deck.filledSize} / {deck.targetSize} · {deck.strategy.label}
            </p>
            {priceCents != null && (
              <div className="text-left sm:text-right">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-fg-muted">
                  Est. deck price
                </p>
                <p className="font-display text-2xl font-extrabold leading-none text-brand-600 tabular-nums sm:text-3xl">
                  {formatPrice(priceCents)}
                </p>
                {isOverBudget && (
                  <p className="mt-1 text-xs font-semibold text-warning-700">
                    Over budget by {formatPrice(overBudgetCents)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-fg-muted">
                {structureRoles.map((role, index) => {
                  const have = structure[role] ?? 0
                  const want = targets[role] ?? 0
                  const met = want <= 0 || have >= want

                  return (
                    <span key={role}>
                      {index > 0 && ' · '}
                      <span className={met ? undefined : 'font-medium text-warning-700'}>
                        {role} {have}/{want}
                      </span>
                    </span>
                  )
                })}
                {' · '}avg MV {deck.averageManaValue}
              </p>
              {isDeckComplete ? (
                <p className="mt-1.5 text-xs font-medium text-success-700">100-card list ready</p>
              ) : (
                structuralGaps.length > 0 && (
                  <p className="mt-1.5 text-xs font-medium text-warning-700">{structuralGaps[0]}</p>
                )
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link to="/stores" className={buttonVariants({ size: 'sm' })}>
                Browse stores
              </Link>
            </div>
          </div>
        </div>

        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-fg-muted transition-colors hover:text-fg">
            Build details
            {deck.combos.length > 0
              ? ` · ${deck.combos.filter((c) => c.completeInStore).length}/${deck.combos.length} combos`
              : ''}
          </summary>
          <div className="mt-2 space-y-1.5 text-xs text-fg-muted">
            {advisoryGaps.length > 0 && (
              <ul className="space-y-1">
                {advisoryGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            )}
            {deck.budget.maxCardCents != null && (
              <p>Max {formatPrice(deck.budget.maxCardCents)} per card</p>
            )}
            {deck.bracket.gameChangersIncluded.length > 0 && (
              <p>
                Game Changers: {deck.bracket.gameChangersIncluded.map((c) => c.name).join(', ')}
              </p>
            )}
            {slotEntries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {slotEntries.map(([slot, count]) => (
                  <span
                    key={slot}
                    className="rounded-md bg-bg px-2 py-0.5 text-[0.65rem] font-semibold capitalize text-fg-muted"
                  >
                    {slot.replaceAll('_', ' ')} {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-fg-muted">{visibleCards.length} cards in list</p>
        <GroupBySwitcher groupBy={groupBy} onChange={setGroupBy} className="sm:max-w-xs" />
      </div>

      <DeckListBody
        cards={visibleCards}
        groupBy={groupBy}
        getPrintingSelection={getPrintingSelection}
        onOpenCardPreview={onOpenCardPreview}
      />
    </div>
  )
}
