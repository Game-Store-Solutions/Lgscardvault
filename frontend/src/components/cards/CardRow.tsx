import { Link } from 'react-router'
import { Sparkles } from 'lucide-react'
import { cardImage, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'
import { Badge } from '../ui'
import { finishName } from '../../lib/finishes'
import { FOIL_GRADIENT, rarityAccent, rarityLabel } from '../../lib/mtg'

export interface CardRowProps {
  item: InventoryItem
  slug: string
}

/**
 * CardRow — list view row (TCGplayer-style): a compact thumbnail with fuller
 * metadata and price detail, for shoppers scanning many printings by price.
 */
export function CardRow({ item, slug }: CardRowProps) {
  const image = cardImage(item.card)
  const accent = rarityAccent(item.card.rarity)
  const price = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')

  return (
    <Link
      to={`/s/${slug}/cards/${item.id}`}
      className={cx(
        'group flex items-center gap-4 rounded-card border border-border bg-surface p-3 shadow-card',
        'transition-colors hover:border-brand-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
    >
      <div className="relative grid h-24 w-[4.35rem] shrink-0 place-items-center overflow-hidden rounded-btn border border-border bg-black/90">
        <CardImage src={image} alt={item.card.name} fit="contain" className="size-full" showLabel={false} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} title={rarityLabel(item.card.rarity)} />
          <h3 className="truncate font-display text-base font-bold tracking-tight text-fg group-hover:text-brand-600">
            {item.card.name}
          </h3>
        </div>
        <p className="mt-0.5 truncate text-xs text-fg-muted">
          {item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Unknown set'}
          {item.card.typeLine ? ` · ${item.card.typeLine}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{item.card.setCode?.toUpperCase() ?? '—'}</Badge>
          <Badge>{item.condition}</Badge>
          {item.isFoil ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-white/60 px-2 py-0.5 text-[0.7rem] font-bold text-black/80"
              style={{ backgroundImage: FOIL_GRADIENT }}
            >
              <Sparkles aria-hidden className="size-3" />
              {finishName(item.card, true, item.finish)}
            </span>
          ) : (
            <Badge tone="neutral">{finishName(item.card, false, item.finish)}</Badge>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[0.7rem] uppercase tracking-wide text-fg-muted">Market</p>
        <p className="font-display text-xl font-bold text-fg">{price}</p>
        <p className="text-xs text-fg-muted">{item.quantity} available</p>
      </div>
    </Link>
  )
}

export default CardRow
