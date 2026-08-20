import { Link } from 'react-router'
import { formatPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { cx } from '../../lib/cx'
import { finishName } from '../../lib/finishes'
import { rarityAccent, rarityLabel } from '../../lib/mtg'
import { HqFoilCardArt } from './HqFoilCardArt'

export type BrowsePrintingEntry = {
  representative: InventoryItem
  listingCount: number
  totalQty: number
  fromPriceCents: number
}

/**
 * Artist / set browse tile: lossless art, foil overlay, spinner until ready.
 */
export function BrowsePrintingTile({
  slug,
  entry,
  toState,
  priority = false,
}: {
  slug: string
  entry: BrowsePrintingEntry
  toState: Record<string, unknown>
  priority?: boolean
}) {
  const { representative, listingCount, totalQty, fromPriceCents } = entry
  const card = representative.card
  const accent = rarityAccent(card.rarity)
  const multiListing = listingCount > 1

  return (
    <Link
      to={`/s/${slug}/cards/${representative.id}`}
      state={toState}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card',
        'transition-transform duration-150 hover:-translate-y-0.5 hover:border-brand-500/35 dark:glass-card ui-lift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      )}
    >
      {multiListing && (
        <span className="absolute right-2 top-2 z-20 rounded-full bg-brand-600 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-white shadow">
          {listingCount} listings
        </span>
      )}
      <HqFoilCardArt card={card} foil={representative.isFoil} priority={priority} fit="contain">
        {card.rarity && (
          <span
            className="absolute left-2 top-2 z-10 size-2.5 rounded-full ring-2 ring-white/80"
            style={{ backgroundColor: accent }}
            title={rarityLabel(card.rarity)}
          />
        )}
        {card.collectorNumber && (
          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            #{card.collectorNumber}
          </span>
        )}
      </HqFoilCardArt>
      <div className="flex flex-1 flex-col p-3">
        <h2 className="line-clamp-2 min-h-[2.5rem] font-display text-sm font-bold leading-snug text-fg group-hover:text-brand-600">
          {card.name}
        </h2>
        <p className="mt-1 truncate text-xs text-fg-muted">
          {card.setCode ? `${card.setCode.toUpperCase()} · ` : ''}
          {card.rarity ? `${rarityLabel(card.rarity)} · ` : ''}
          {finishName(card, representative.isFoil, representative.finish)}
          {representative.condition ? ` · ${representative.condition}` : ''}
        </p>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
          <span className="text-lg font-bold tabular-nums text-fg">
            {multiListing ? `From ${formatPrice(fromPriceCents)}` : formatPrice(fromPriceCents)}
          </span>
          <span className="text-xs font-medium text-fg-muted">{totalQty} in stock</span>
        </div>
      </div>
    </Link>
  )
}
