import { cardImage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Badge } from '../../../components/ui'
import { CardImage } from '../../../components/cards'

export interface CatalogResultCardProps {
  card: CardSummary
  selected: boolean
  onSelect: () => void
}

/** A single catalog search hit in the "Add inventory" picker grid. */
export function CatalogResultCard({ card, selected, onSelect }: CatalogResultCardProps) {
  const previewFinish = card.finishes?.includes('foil') && !card.finishes.includes('nonfoil') ? 'foil' : 'nonfoil'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-28 items-start gap-3 rounded-card border px-3 py-3 text-left transition-colors ${
        selected ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface hover:bg-bg'
      }`}
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
          {(card.finishes?.length ? card.finishes : ['nonfoil']).map((finish) => (
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
