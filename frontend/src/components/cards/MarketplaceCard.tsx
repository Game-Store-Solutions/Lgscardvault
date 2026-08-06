import { Link } from 'react-router'
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
  signedIn: boolean
  inCartQuantity?: number
  adding?: boolean
  onAddToCart: () => void
}

export function MarketplaceCard({
  item,
  slug,
  signedIn,
  inCartQuantity,
  adding = false,
  onAddToCart,
}: MarketplaceCardProps) {
  const image = cardImage(item.card)
  const accent = rarityAccent(item.card.rarity)
  const marketPrice = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')
  const copiesLabel = `${item.quantity} ${item.quantity === 1 ? 'listing' : 'listings'} from`
  const outOfStock = item.quantity < 1

  return (
    <article className="group flex min-h-52 gap-4 rounded-card border border-border bg-surface p-3 shadow-card dark:glass-card ui-lift hover:border-brand-500/30">
      <Link
        to={`/s/${slug}/cards/${item.id}`}
        className="w-24 shrink-0 self-center sm:w-28"
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

      <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
        <div className="min-w-0">
          <Link
            to={`/s/${slug}/cards/${item.id}`}
            className="block overflow-hidden font-display text-base font-extrabold leading-snug tracking-tight text-fg hover:text-brand-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]"
          >
            {item.card.name}
          </Link>
          <p className="mt-1 text-sm leading-5 text-fg-muted">
            {item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Unknown set'}
            <br />
            {item.card.rarity ? `${rarityLabel(item.card.rarity)}, ` : ''}
            #{item.card.collectorNumber ?? '-'}
          </p>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-fg">{copiesLabel}</p>
          <p className="font-display text-2xl font-extrabold leading-none text-fg">{formatPrice(item.priceCents)}</p>
          <p className="mt-2 text-sm font-bold text-fg">
            Market Price: <span className="text-success-500 dark:text-success-500">{marketPrice}</span>
          </p>
          <p className="mt-1 text-xs font-medium text-fg-muted">
            {item.condition} / {finishName(item.card, item.isFoil, item.finish)}
          </p>

          <div className="mt-3 max-w-36">
            {!signedIn ? (
              <Link to="/login" className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} w-full`}>
                Sign in to add
              </Link>
            ) : inCartQuantity ? (
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
