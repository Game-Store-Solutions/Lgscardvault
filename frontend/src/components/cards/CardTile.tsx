import { Link } from 'react-router'
import { ImageOff } from 'lucide-react'
import { cardImage, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'
import { useTilt } from '../../hooks'
import { rarityAccent, rarityLabel } from '../../lib/mtg'
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
  const accent = rarityAccent(item.card.rarity)
  const price = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')
  const { ref, onPointerMove, onPointerLeave } = useTilt(9)

  return (
    <Link
      to={`/s/${slug}/cards/${item.id}`}
      className={cx(
        'group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card',
        'transition-shadow duration-200 ease-out hover:shadow-[0_16px_40px_-16px_rgb(16_24_40_/0.30)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
    >
      {/* Card art with holographic tilt */}
      <div ref={ref} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="perspective-[900px]">
        <div className={cx('tilt-card relative aspect-5/7 overflow-hidden bg-black/90', item.isFoil && 'foil-card')}>
          {image ? (
            <CardImage src={image} alt={item.card.name} fit="contain" className="size-full" />
          ) : (
            <div className="grid size-full place-items-center">
              <ImageOff aria-hidden className="size-7 text-fg-muted" />
            </div>
          )}

          {/* Holographic overlays (the sheen itself signals a foil — no pill needed) */}
          {image && <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0" />}
          {image && item.isFoil && <span aria-hidden className="tilt-holo pointer-events-none absolute inset-0" />}

          {/* Rarity dot */}
          {item.card.rarity && (
            <span
              className="absolute right-2 top-2 z-10 size-3 rounded-full ring-2 ring-white/70"
              style={{ backgroundColor: accent }}
              title={rarityLabel(item.card.rarity)}
            />
          )}

          {/* Price chip */}
          <span className="absolute bottom-2 right-2 z-10 rounded-full bg-black/70 px-2.5 py-1 text-sm font-bold text-white backdrop-blur-sm">
            {price}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="truncate font-display text-sm font-bold tracking-tight text-fg group-hover:text-brand-600">
          {item.card.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-fg-muted">
          {item.card.setCode?.toUpperCase() ?? '—'} · {item.condition}
          {item.card.rarity ? ` · ${rarityLabel(item.card.rarity)}` : ''}
          {item.isFoil ? ` · ${finishName(item.card, true, item.finish)}` : ''}
        </p>
        <p className="mt-2 text-xs font-medium text-fg-muted">{item.quantity} available</p>
      </div>
    </Link>
  )
}

export default CardTile
