import { Package, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useCart, useSealedSpotlight } from '../../hooks'
import { Button } from '../ui'
import { CardImage } from '../cards'

/**
 * Storefront rail of the store's freshest in-stock sealed products
 * (booster boxes, bundles, decks) across every game. Renders nothing when
 * the store carries no sealed stock, so single-focus stores stay clean.
 */
export function SealedSpotlightRow({ slug, gameCode }: { slug: string; gameCode?: string }) {
  const { user } = useAuth()
  const { data: lines = [] } = useSealedSpotlight(slug, gameCode)
  const { query: cartQuery, setSealedItem } = useCart(slug, Boolean(user))

  if (lines.length === 0) return null

  const cart = cartQuery.data ?? []

  return (
    <section>
      <div className="mb-4">
        <h2 className="inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg">
          <span className="grid size-8 place-items-center rounded-btn bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Package aria-hidden className="size-4" />
          </span>
          Sealed products
        </h2>
        <p className="mt-1 text-sm text-fg-muted">Booster boxes, bundles, and decks in stock</p>
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lines.map((line) => {
          const product = line.product
          if (!product) return null
          return (
            <div
              key={line.id}
              className="w-48 shrink-0 snap-start rounded-card border border-border bg-surface p-3 shadow-card"
            >
              <CardImage
                src={product.imageUrl}
                alt={product.name}
                fit="contain"
                className="mx-auto h-36 w-full rounded"
              />
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-fg" title={product.name}>
                {product.name}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {product.gameName ?? product.gameCode}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-display text-base font-bold text-fg">{formatPrice(line.priceCents)}</span>
                <span className="text-xs font-medium text-fg-muted">{line.quantity} in stock</span>
              </div>
              {user && (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  disabled={setSealedItem.isPending}
                  onClick={() =>
                    setSealedItem.mutate({
                      item: line,
                      // Adding again tops the line up by one, matching the
                      // singles "add another copy" behavior.
                      quantity: (cart.find((entry) => entry.sealedItem?.id === line.id)?.quantity ?? 0) + 1,
                    })
                  }
                >
                  <ShoppingCart aria-hidden className="size-4" />
                  Add to cart
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
