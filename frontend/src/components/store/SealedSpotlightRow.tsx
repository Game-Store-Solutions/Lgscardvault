import { ChevronLeft, ChevronRight, Package, ShoppingCart } from 'lucide-react'
import { useRef } from 'react'
import { formatPrice } from '../../api/client'
import type { SealedInventoryLine } from '../../api/types'
import { useAuth } from '../../context/AuthContext'
import { useSealedSpotlight, useStoreCart } from '../../hooks'
import { Badge, Button } from '../ui'
import { CardImage } from '../cards'
import { cx } from '../../lib/cx'

/** In-stock sealed row — same tile width and rail as the singles spotlight. */
export function SealedSpotlightRow({ slug, gameCode }: { slug: string; gameCode?: string }) {
  const { user } = useAuth()
  const { data: lines = [] } = useSealedSpotlight(slug, gameCode)
  const { query: cartQuery, setSealedItem } = useStoreCart(slug, Boolean(user))
  const railRef = useRef<HTMLDivElement>(null)

  if (lines.length === 0) return null

  const cart = cartQuery.data ?? []

  function scrollRail(direction: -1 | 1) {
    const el = railRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section aria-label="Sealed products">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Package aria-hidden className="size-4" />
            </span>
            Sealed products
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Boxes, bundles, and decks in stock</p>
        </div>
        <p className="text-sm text-fg-muted">
          <span className="font-bold text-fg">{lines.length}</span> items
        </p>
      </div>

      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg to-transparent" />
        <button
          type="button"
          onClick={() => scrollRail(-1)}
          aria-label="Scroll sealed products left"
          className="absolute left-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/95 text-fg-muted shadow-md backdrop-blur transition-colors hover:text-brand-600 sm:grid"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollRail(1)}
          aria-label="Scroll sealed products right"
          className="absolute right-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/95 text-fg-muted shadow-md backdrop-blur transition-colors hover:text-brand-600 sm:grid"
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
        <div
          ref={railRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-14 pb-2 pl-14 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {lines.map((line) => (
            <SealedProductCard
              key={line.id}
              line={line}
              cartQty={cart.find((entry) => entry.sealedItem?.id === line.id)?.quantity ?? 0}
              pending={setSealedItem.isPending}
              onAdd={() =>
                setSealedItem.mutate({
                  item: line,
                  quantity: (cart.find((entry) => entry.sealedItem?.id === line.id)?.quantity ?? 0) + 1,
                })
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function SealedProductCard({
  line,
  cartQty,
  pending,
  onAdd,
}: {
  line: SealedInventoryLine
  cartQty: number
  pending: boolean
  onAdd: () => void
}) {
  const product = line.product
  if (!product) return null

  const lowStock = line.quantity <= 3

  return (
    <article className="group relative w-40 shrink-0 snap-start sm:w-52">
      <div
        className={cx(
          'relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface/80 p-3',
          'transition-colors group-hover:border-brand-300',
        )}
      >
        <CardImage src={product.imageUrl} alt={product.name} fit="contain" className="max-h-full max-w-full" />
        {lowStock && (
          <Badge tone="warning" className="absolute left-2 top-2">
            Low stock
          </Badge>
        )}
        {cartQty > 0 && (
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-sm">
            {cartQty}
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <h3
          className="line-clamp-2 min-h-[2.5rem] font-display text-sm font-bold leading-snug tracking-tight text-fg"
          title={product.name}
        >
          {product.name}
        </h3>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-display text-sm font-bold text-fg">{formatPrice(line.priceCents)}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || line.quantity < 1}
            onClick={onAdd}
            className="shrink-0"
            aria-label={cartQty > 0 ? `Add another ${product.name}` : `Add ${product.name} to cart`}
          >
            <ShoppingCart aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

export default SealedSpotlightRow
