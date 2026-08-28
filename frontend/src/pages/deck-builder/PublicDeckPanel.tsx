import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { formatPrice } from '../../api/client'
import type { AssembledDeckResponse } from '../../hooks'
import { buttonVariants, LoadingPanel } from '../../components/ui'
import { AnimatePresence, EASE_PREMIUM, motion } from '../../components/motion'
import {
  PublicFloatingCard,
  PUBLIC_FLOATING_CARD_GRID_CLASS,
  previewFromDeckRow,
  type CardArtPreview,
} from '../../components/cards'
import { cx } from '../../lib/cx'
import { DeckBuildConstraintsFields } from './DeckBuildConstraintsFields'
import type { DeckBracket } from './utils'

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
  onOpenCardPreview,
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
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
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
  const previewCards: CardArtPreview[] = visibleCards.map((row) => previewFromDeckRow(row))
  const structureBits = (['lands', 'ramp', 'draw', 'removal'] as const)
    .map((role) => `${role} ${structure[role] ?? 0}/${targets[role] ?? 0}`)
    .join(' · ')

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-base font-extrabold text-fg">
              {deck.filledSize} / {deck.targetSize} · {deck.strategy.label}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {deck.bracket.label}
              {deck.bracket.auto ? ' · auto' : ''}
              {' · '}
              {deck.budget.limitCents != null
                ? `${formatPrice(deck.budget.spentCents)} of ${formatPrice(deck.budget.limitCents)}`
                : formatPrice(deck.budget.spentCents)}
              {' · '}
              {deck.cards.length} cards in list
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {structureBits} · avg MV {deck.averageManaValue}
            </p>
            {deck.gaps.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-warning-700">{deck.gaps[0]}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/stores" className={buttonVariants({ size: 'sm' })}>
              Browse stores
            </Link>
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

      <ul className={PUBLIC_FLOATING_CARD_GRID_CLASS}>
        {visibleCards.map((row) => {
          const preview = previewFromDeckRow(row)
          const badge =
            row.quantity > 1
              ? `${row.quantity}×`
              : row.gameChanger
                ? 'GC'
                : undefined
          return (
            <PublicFloatingCard
              key={row.card.oracleId}
              preview={preview}
              onPreview={() => onOpenCardPreview(previewCards, row.card.oracleId)}
              badge={badge}
            />
          )
        })}
      </ul>
    </div>
  )
}
