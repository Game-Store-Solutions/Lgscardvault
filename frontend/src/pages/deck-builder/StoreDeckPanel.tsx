import { useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router'
import { Search, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../api/client'
import type { AssembledDeckResponse } from '../../hooks'
import type { DeckBuilderGroupBy } from '../../lib/deckBuilder'
import { Button, buttonVariants, EmptyState, LoadingPanel } from '../../components/ui'
import { type CardArtPreview } from '../../components/cards'
import { cx } from '../../lib/cx'
import { DeckListBody } from './deck/DeckListBody'
import { GroupBySwitcher } from './GroupBySwitcher'
import { intelligenceSummary } from './utils'

export function StoreDeckPanel({
  slug,
  loading,
  deck,
  signedIn,
  busy,
  onAddAll,
  groupBy,
  setGroupBy,
  onOpenCardPreview,
}: {
  slug: string
  loading: boolean
  deck: AssembledDeckResponse | undefined
  signedIn: boolean
  busy: boolean
  onAddAll: () => void
  groupBy: DeckBuilderGroupBy
  setGroupBy: Dispatch<SetStateAction<DeckBuilderGroupBy>>
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all')

  if (loading || !deck) {
    return <LoadingPanel label="Assembling a deck from store inventory…" />
  }

  const slotEntries = Object.entries(deck.slots).filter(
    ([key, count]) => key !== 'commander' && Number(count) > 0,
  )
  const structure = deck.structure?.actual ?? {}
  const targets = deck.structure?.targets ?? {}
  const inStockCount = deck.cards.filter((row) => row.inventoryItem).length
  const outOfStockCount = deck.cards.length - inStockCount
  const visibleCards = deck.cards.filter((row) => {
    if (stockFilter === 'in_stock') return Boolean(row.inventoryItem)
    if (stockFilter === 'out_of_stock') return !row.inventoryItem
    return true
  })
  const intel = deck.intelligence
  const intelLine = intelligenceSummary(intel)
  const structureBits = (['lands', 'ramp', 'draw', 'removal'] as const)
    .map((role) => `${role} ${structure[role] ?? 0}/${targets[role] ?? 0}`)
    .join(' · ')

  return (
    <div className="space-y-4">
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
              {inStockCount}/{deck.cards.length} in stock
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {structureBits} · avg MV {deck.averageManaValue}
            </p>
            {deck.gaps.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-warning-700">{deck.gaps[0]}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!signedIn ? (
              <Link to="/login" className={buttonVariants({ size: 'sm' })}>
                Sign in to add deck
              </Link>
            ) : (
              <Button size="sm" loading={busy} disabled={busy || deck.cards.length === 0} onClick={onAddAll}>
                <ShoppingCart aria-hidden className="size-4" />
                Add available
              </Button>
            )}
            <Link to={`/s/${slug}/cart`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Cart
            </Link>
          </div>
        </div>

        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-fg-muted transition-colors hover:text-fg">
            Build details
            {intel ? ` · ${Math.round(intel.confidence * 100)}% confidence` : ''}
            {deck.combos.length > 0
              ? ` · ${deck.combos.filter((c) => c.completeInStore).length}/${deck.combos.length} combos`
              : ''}
          </summary>
          <div className="mt-2 space-y-1.5 text-xs text-fg-muted">
            {intelLine && <p>{intelLine}</p>}
            <p>
              Built from {intel?.source ?? 'catalog'}
              {deck.budget.maxCardCents != null
                ? ` · max ${formatPrice(deck.budget.maxCardCents)} / card`
                : ''}
            </p>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-btn border border-border bg-bg p-0.5">
          {(
            [
              { id: 'all', label: `All (${deck.cards.length})` },
              { id: 'in_stock', label: `In stock (${inStockCount})` },
              { id: 'out_of_stock', label: `Not stocked (${outOfStockCount})` },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStockFilter(option.id)}
              className={cx(
                'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
                stockFilter === option.id
                  ? 'bg-brand-500 text-white'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          Showing {visibleCards.length} of {deck.cards.length}
        </p>
        <GroupBySwitcher groupBy={groupBy} onChange={setGroupBy} />
      </div>

      {visibleCards.length === 0 ? (
        <EmptyState
          icon={Search}
          title={stockFilter === 'in_stock' ? 'No in-stock cards in this list' : 'No out-of-stock cards'}
          description={
            stockFilter === 'in_stock'
              ? 'This build has no buyable printings here. Switch to All or Not stocked to review the full list.'
              : 'Every card in this build is available at this store.'
          }
        />
      ) : (
        <DeckListBody
          cards={visibleCards}
          groupBy={groupBy}
          storeSlug={slug}
          onOpenCardPreview={onOpenCardPreview}
        />
      )}
    </div>
  )
}
