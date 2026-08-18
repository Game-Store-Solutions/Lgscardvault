import { Link } from 'react-router'
import { ImageOff } from 'lucide-react'
import { cardImage, formatPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'
import { Badge } from '../ui'
import { rarityLabel } from '../../lib/mtg'
import { finishName } from '../../lib/finishes'

export interface CardTileProps {
  item: InventoryItem
  slug: string
}

/**
 * CardTile — image-forward storefront result card (grid view). The art fills
 * the top with a subtle pointer-driven holographic tilt (glare always, rainbow
 * holo for foils); rarity + foil accents add game flavor; the footer keeps the
 * name, printing and market price scannable.
 */
export function CardTile({ item, slug }: CardTileProps) {
  const image = cardImage(item.card)
  const price = formatPrice(item.priceCents)

  return (
    <Link
      to={`/s/${slug}/cards/${item.id}`}
      className={cx(
        'group flex h-full flex-col overflow-hidden rounded-[1.2rem] border border-white/8 bg-[#111113]',
        'transition-[transform,border-color,box-shadow] hover:-translate-y-1 hover:border-white/16 hover:shadow-[0_26px_70px_-34px_rgba(0,0,0,0.78)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
    >
      <div className="relative aspect-[0.74] overflow-hidden bg-[#0d0d10]">
          {image ? (
            <CardImage src={image} alt={item.card.name} fit="cover" className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="grid size-full place-items-center">
              <ImageOff aria-hidden className="size-7 text-fg-muted" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#09090b] via-[#09090bcc] to-transparent" />
          <span className="absolute bottom-3 right-3 z-10 rounded-full bg-black/72 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
            {price}
          </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
            {item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Unknown set'}
          </p>
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-[-0.02em] text-fg sm:text-base">
            {item.card.name}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.card.rarity && <Badge tone="neutral">{rarityLabel(item.card.rarity)}</Badge>}
          <Badge tone="neutral">{item.condition}</Badge>
          {item.isFoil && <Badge tone="brand">{finishName(item.card, true, item.finish)}</Badge>}
        </div>
        <p className="mt-auto text-xs text-fg-muted">
          {item.quantity} available
        </p>
      </div>
    </Link>
  )
}

export default CardTile
