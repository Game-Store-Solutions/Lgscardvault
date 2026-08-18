import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Check, ShoppingCart } from 'lucide-react'
import { EASE_PREMIUM } from '../motion'
import { cardImage, formatPrice, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { Badge, Button, buttonVariants } from '../ui'
import { rarityLabel } from '../../lib/mtg'
import { finishName } from '../../lib/finishes'
import { CardImage } from './CardImage'

export interface MarketplaceCardProps {
  item: InventoryItem
  slug: string
  inCartQuantity?: number
  adding?: boolean
  onAddToCart: () => void
}

export function MarketplaceCard({
  item,
  slug,
  inCartQuantity,
  adding = false,
  onAddToCart,
}: MarketplaceCardProps) {
  const image = cardImage(item.card)
  const marketPrice = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')
  const outOfStock = item.quantity < 1

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ duration: 0.22, ease: EASE_PREMIUM }}
      className="@container/market-card group flex min-h-0 min-w-0 gap-3.5 rounded-card border border-border bg-surface p-3.5 shadow-card transition-[border-color,box-shadow] hover:border-fg/15 hover:shadow-lg sm:min-h-56 sm:gap-5 sm:p-5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
    >
      <Link
        to={`/s/${slug}/cards/${item.id}`}
        className="w-[5.25rem] shrink-0 self-start sm:w-28"
        aria-label={item.card.name}
      >
        <div className="overflow-hidden rounded-btn border border-border bg-bg dark:border-white/10 dark:bg-[#0d0d10]">
          <div className="aspect-[0.74] overflow-hidden">
            <CardImage src={image} alt={item.card.name} fit="cover" className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
          </div>
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="min-w-0 space-y-2">
          <Link
            to={`/s/${slug}/cards/${item.id}`}
            className="block overflow-hidden font-display text-base font-bold leading-snug tracking-tight text-fg transition-colors hover:text-brand-600 sm:text-xl dark:hover:text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]"
          >
            {item.card.name}
          </Link>
          <p className="text-sm leading-snug text-fg-muted">
            {item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Unknown set'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {item.card.rarity && <Badge tone="neutral">{rarityLabel(item.card.rarity)}</Badge>}
            <Badge tone="neutral">{item.condition}</Badge>
            <Badge tone="brand">{finishName(item.card, item.isFoil, item.finish)}</Badge>
            {item.card.collectorNumber && <Badge tone="neutral">#{item.card.collectorNumber}</Badge>}
          </div>
        </div>

        <div className="mt-4 flex min-w-0 flex-1 flex-col gap-1.5 sm:mt-5">
          <p className="text-xs text-fg-muted">
            {item.quantity} available
          </p>
          <p className="max-w-full font-display text-xl font-bold tabular-nums leading-none tracking-tight text-fg @xs/market-card:text-2xl sm:text-3xl">
            {formatPrice(item.priceCents)}
          </p>
          <p className="text-[13px] font-medium leading-snug text-success-600 dark:text-success-500">
            Market {marketPrice}
          </p>

          <div className="mt-auto w-full max-w-none pt-3 sm:max-w-[10.5rem] sm:pt-4">
            {inCartQuantity ? (
              <Link to={`/s/${slug}/cart`} className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} w-full`}>
                <Check aria-hidden className="size-4" />
                In cart ({inCartQuantity})
              </Link>
            ) : (
              <Button size="sm" className="w-full" loading={adding} disabled={adding || outOfStock} onClick={onAddToCart}>
                <ShoppingCart aria-hidden className="size-4" />
                {outOfStock ? 'Out of stock' : 'Add to cart'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  )
}

export default MarketplaceCard
