import { Heart, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'framer-motion'
import type { InventoryItem } from '../../api/types'
import { cardImage, formatPrice } from '../../api/client'
import { CardImage } from '../cards/CardImage'
import { Badge } from '../ui'
import { gameMetaFor } from '../../lib/tcgCatalog'
import { rarityLabel } from '../../lib/mtg'
import { cx } from '../../lib/cx'

type CollectibleCardProps = {
  item: InventoryItem
  slug: string
  showStore?: boolean
  storeName?: string
  priority?: boolean
}

export function CollectibleCard({
  item,
  slug,
  showStore = false,
  storeName,
}: CollectibleCardProps) {
  const reduceMotion = useReducedMotion()
  const image = cardImage(item.card)
  const game = gameMetaFor(item.card.gameCode)
  const marketPrice = item.priceCents > 0 ? formatPrice(item.priceCents) : null

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -6 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="group h-full"
    >
      <Link
        to={`/s/${slug}/cards/${item.id}`}
        className={cx(
          'market-card relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-border/80 bg-surface/92',
          'shadow-[0_18px_50px_-28px_rgba(0,0,0,0.6)] transition-[border-color,box-shadow,transform]',
          'hover:border-white/18 hover:shadow-[0_26px_80px_-34px_rgba(0,0,0,0.75)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        )}
      >
        <div className="absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-3">
          <Badge
            tone="outline"
            uppercase
            className="border-white/10 bg-black/40 text-white backdrop-blur-md"
            style={{ borderColor: `${game.accent}55` }}
          >
            {game.shortLabel}
          </Badge>
          <button
            type="button"
            aria-label="Save to wishlist"
            className="rounded-full border border-white/10 bg-black/40 p-2 text-white/70 opacity-0 backdrop-blur-md transition group-hover:opacity-100 group-hover:text-white"
            onClick={(event) => event.preventDefault()}
          >
            <Heart className="size-4" />
          </button>
        </div>

        <div className={cx('relative aspect-[0.74] overflow-hidden bg-[#0d0d10]', item.isFoil && 'foil-card')}>
          <motion.div
            whileHover={reduceMotion ? undefined : { scale: 1.045 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="h-full w-full"
          >
            <CardImage src={image} alt={item.card.name} className="h-full w-full" />
          </motion.div>
          {item.isFoil && image ? (
            <span aria-hidden className="tilt-holo pointer-events-none absolute inset-0" />
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#09090b] via-[#09090bcc] to-transparent" />
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fg-muted">
              {item.card.setName ? <span>{item.card.setName}</span> : null}
              {item.card.collectorNumber ? <span>#{item.card.collectorNumber}</span> : null}
            </div>
            <h3 className="line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-fg">
              {item.card.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {item.card.rarity ? <Badge tone="neutral">{rarityLabel(item.card.rarity)}</Badge> : null}
              <Badge tone="outline">{item.condition}</Badge>
              {item.isFoil ? (
                <Badge tone="brand" className="bg-brand-500/15 text-brand-700 dark:bg-brand-500/18 dark:text-white">
                  <Sparkles className="size-3" />
                  Foil
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="space-y-1">
              {showStore && storeName ? <p className="text-xs text-fg-muted">{storeName}</p> : null}
              <p className="text-2xl font-semibold tracking-[-0.04em] text-fg">{marketPrice ?? 'Inquire'}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-fg transition group-hover:bg-brand-500 group-hover:text-white">
              View card
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export default CollectibleCard
