import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ImageOff } from 'lucide-react'
import { cardImage, formatPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'
import { Badge } from '../ui'
import { EASE_PREMIUM } from '../motion'
import { rarityLabel } from '../../lib/mtg'
import { finishName } from '../../lib/finishes'

export interface CardTileProps {
  item: InventoryItem
  slug: string
}

/**
 * CardTile — image-forward storefront result card (grid view). The art leads,
 * the price sits on the art, and the footer keeps set / condition / finish
 * scannable at two columns on mobile.
 */
export function CardTile({ item, slug }: CardTileProps) {
  const image = cardImage(item.card)
  const price = formatPrice(item.priceCents)

  return (
    <motion.div
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.22, ease: EASE_PREMIUM }}
      className="h-full"
    >
      <Link
        to={`/s/${slug}/cards/${item.id}`}
        className={cx(
          'group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card',
          'transition-[border-color,box-shadow] hover:border-fg/15 hover:shadow-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20',
        )}
      >
        <div className="relative aspect-[0.74] overflow-hidden bg-bg dark:bg-[#0d0d10]">
          {image ? (
            <CardImage
              src={image}
              alt={item.card.name}
              fit="cover"
              className="size-full transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid size-full place-items-center">
              <ImageOff aria-hidden className="size-7 text-fg-muted" />
            </div>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent"
          />
          <span className="absolute bottom-2.5 right-2.5 z-10 rounded-full bg-black/70 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
            {price}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
          <div className="space-y-1.5">
            <p className="truncate text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
              {item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Unknown set'}
            </p>
            <h3 className="line-clamp-2 text-sm font-bold leading-5 tracking-tight text-fg sm:text-base">
              {item.card.name}
            </h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {item.card.rarity && <Badge tone="neutral">{rarityLabel(item.card.rarity)}</Badge>}
            <Badge tone="neutral">{item.condition}</Badge>
            {item.isFoil && <Badge tone="brand">{finishName(item.card, true, item.finish)}</Badge>}
          </div>

          <p className="mt-auto text-xs text-fg-muted">{item.quantity} available</p>
        </div>
      </Link>
    </motion.div>
  )
}

export default CardTile
