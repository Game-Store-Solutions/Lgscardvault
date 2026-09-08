import { cardImage, formatScryfallPrice } from '../../api/client'
import type { CardSummary } from '../../api/types'
import { Badge } from '../ui'
import { CardImage } from '../cards'
import { finishChoices } from '../../lib/finishes'

export interface CatalogResultCardProps {
  card: CardSummary
  selected: boolean
  onSelect: () => void
  /** Dense row for customer pickers; inventory add keeps the full card. */
  compact?: boolean
}

/** A single catalog search hit in a picker grid (inventory add, want list). */
export function CatalogResultCard({ card, selected, onSelect, compact = false }: CatalogResultCardProps) {
  // Price the printing by what it is actually sold as: a holo-only Pokemon
  // card has no plain price to preview.
  const finishes = finishChoices(card)
  const previewFinish = finishes.hasFoil && !finishes.hasPlain ? 'foil' : 'nonfoil'
  const selectedClass = selected ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface hover:bg-bg'
  const meta = [
    card.setCode?.toUpperCase() ?? '—',
    card.collectorNumber ? `#${card.collectorNumber}` : null,
    card.setName,
  ]
    .filter(Boolean)
    .join(' · ')

  if (compact) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors ${selectedClass}`}
      >
        <CardImage
          src={cardImage(card)}
          alt=""
          fit="contain"
          showLabel={false}
          className="h-20 w-14 shrink-0 rounded-lg"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{card.name}</span>
          <span className="block truncate text-xs text-fg-muted">{meta}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-fg-muted">{formatScryfallPrice(card, previewFinish)}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-28 items-start gap-3 rounded-card border px-3 py-3 text-left transition-colors ${selectedClass}`}
    >
      <CardImage
        src={cardImage(card)}
        alt={card.name}
        fit="contain"
        showLabel={false}
        className="h-20 w-14 flex-shrink-0 rounded-btn"
      />
      <span className="min-w-0 space-y-1">
        <span className="block font-bold leading-snug text-fg">{card.name}</span>
        <span className="block text-xs uppercase text-fg-muted">
          {card.setCode ?? '---'} #{card.collectorNumber ?? '---'}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </span>
        {card.setName && <span className="block truncate text-xs text-fg-muted">{card.setName}</span>}
        <span className="block text-xs font-bold text-brand-600">{formatScryfallPrice(card, previewFinish)}</span>
        <span className="flex flex-wrap gap-1 pt-1">
          {(card.finishes?.length ? card.finishes : [finishes.plain]).map((finish) => (
            <Badge key={finish} className="uppercase">
              {finish}
            </Badge>
          ))}
        </span>
      </span>
    </button>
  )
}

export default CatalogResultCard
