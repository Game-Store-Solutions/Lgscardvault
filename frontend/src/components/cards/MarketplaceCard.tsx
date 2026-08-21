import { Link } from 'react-router'
import { useInventoryItemLink } from '../../hooks/useInventoryItemLink'
import { Check, ShoppingCart } from 'lucide-react'
import { cardImage, formatPrice, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { Button, buttonVariants } from '../ui'
import { rarityAccent, rarityLabel } from '../../lib/mtg'
import { finishName } from '../../lib/finishes'
import { InteractiveCard } from './InteractiveCard'

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
  const accent = rarityAccent(item.card.rarity)
  const marketPrice = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')
  const outOfStock = item.quantity < 1
  const link = useInventoryItemLink(slug)

  return (
    <article className="@container/market-card group flex min-h-0 min-w-0 gap-3 rounded-card store-frame store-frame-card p-3 ui-lift hover:border-brand-500/30 sm:min-h-56 sm:gap-5 sm:p-5">
      <Link
        to={link.to(item.id)}
        state={link.state}
        className="w-[5.25rem] shrink-0 self-center sm:w-24"
        aria-label={item.card.name}
      >
        <InteractiveCard
          image={image}
          alt={item.card.name}
          foil={item.isFoil}
          accent={accent}
          maxTilt={9}
          shadow={false}
          className="w-full"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="min-w-0 space-y-1">
          <Link
            to={link.to(item.id)}
            state={link.state}
            className="block overflow-hidden text-base font-semibold leading-snug text-fg hover:text-brand-600 sm:text-lg [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]"
          >
            {item.card.name}
          </Link>
          <p className="text-sm leading-snug text-fg-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]">
            {item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Unknown set'}
          </p>
          <p className="text-[13px] leading-snug text-fg-muted">
            {item.card.rarity ? `${rarityLabel(item.card.rarity)} · ` : ''}#{item.card.collectorNumber ?? '—'}
          </p>
        </div>

        <div className="mt-4 flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs text-fg-muted">
            {item.quantity} {item.quantity === 1 ? 'listing' : 'listings'}
          </p>
          <p className="max-w-full font-display text-xl font-bold tabular-nums leading-none tracking-tight text-fg @xs/market-card:text-2xl @md/market-card:text-[2.125rem]">
            {formatPrice(item.priceCents)}
          </p>
          <p className="text-[13px] font-medium leading-snug text-success-600 dark:text-success-500">
            Market {marketPrice}
          </p>
          <p className="text-xs leading-snug text-fg-muted">
            {item.condition} / {finishName(item.card, item.isFoil, item.finish)}
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
    </article>
  )
}

export default MarketplaceCard
