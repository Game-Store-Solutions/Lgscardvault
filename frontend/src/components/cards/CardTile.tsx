import { Link } from 'react-router'
import { ImageOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { cardImage, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'
import { FoilOverlays } from './FoilOverlays'
import { useTilt } from '../../hooks'
import { rarityAccent, rarityLabel } from '../../lib/mtg'
import { finishName } from '../../lib/finishes'

export interface CardTileProps {
  item: InventoryItem
  slug: string
}

/**
 * CardTile — image-forward storefront result card (grid view). The art fills
 * the top with a springy pointer-driven holographic tilt. Foils keep a slow
 * idle Holo flow (warp, scale, definition). Rarity accents add game flavor;
 * the footer keeps the name, printing and market price scannable.
 */
export function CardTile({ item, slug }: CardTileProps) {
  const image = cardImage(item.card)
  const accent = rarityAccent(item.card.rarity)
  const price = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')
  const { ref, onPointerEnter, onPointerMove, onPointerLeave, tiltStyle } = useTilt(9, { idle: item.isFoil })

  return (
    <Link
      to={`/s/${slug}/cards/${item.id}`}
      className={cx(
        'group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card dark:glass-card ui-lift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
    >
      {/* Card art with holographic tilt */}
      <div
        ref={ref}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="perspective-[900px]"
      >
        <motion.div
          className={cx('tilt-card relative aspect-5/7 overflow-hidden bg-surface-elevated dark:bg-[#18181B]', item.isFoil && 'foil-card')}
          style={tiltStyle}
        >
          {image ? (
            <CardImage src={image} alt={item.card.name} fit="contain" className="size-full" />
          ) : (
            <div className="grid size-full place-items-center">
              <ImageOff aria-hidden className="size-7 text-fg-muted" />
            </div>
          )}

          {/* Holographic overlays (the sheen itself signals a foil. No pill needed) */}
          {image && <FoilOverlays foil={item.isFoil} />}

          {/* Rarity dot */}
          {item.card.rarity && (
            <span
              className="absolute right-2 top-2 z-10 size-3 rounded-full ring-2 ring-white/70"
              style={{ backgroundColor: accent }}
              title={rarityLabel(item.card.rarity)}
            />
          )}

          {/* Price chip */}
          <span className="absolute bottom-2 right-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm sm:px-2.5 sm:py-1 sm:text-sm">
            {price}
          </span>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <h3 className="truncate font-display text-xs font-bold tracking-tight text-fg group-hover:text-brand-600 sm:text-sm">
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
