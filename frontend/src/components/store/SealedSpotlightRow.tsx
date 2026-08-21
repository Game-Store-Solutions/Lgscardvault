import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useSealedSpotlight, useStoreCart } from '../../hooks'
import { SpotlightRailSkeleton } from '../ui'
import { SealedProductCard } from './SealedProductCard'

const VIEW_ALL_AFTER = 10

/** In-stock sealed row — same tile width and rail as the singles spotlight. */
export function SealedSpotlightRow({ slug, gameCode }: { slug: string; gameCode?: string }) {
  const { user } = useAuth()
  const { data, isPending } = useSealedSpotlight(slug, gameCode)
  const { query: cartQuery, setSealedItem } = useStoreCart(slug, Boolean(user))
  const railRef = useRef<HTMLDivElement>(null)

  const lines = data?.items ?? []
  const total = data?.total ?? lines.length

  if (!isPending && lines.length === 0) return null

  const cart = cartQuery.data ?? []
  const viewAllTo = gameCode ? `/s/${slug}/sealed?game=${encodeURIComponent(gameCode)}` : `/s/${slug}/sealed`

  function scrollRail(direction: -1 | 1) {
    const el = railRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section aria-label="Sealed products">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Package aria-hidden className="size-4" />
            </span>
            Sealed products
          </h2>
          <p className="mt-1 hidden text-sm text-fg-muted sm:block">Boxes, bundles, and decks in stock</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <p className="text-sm text-fg-muted">
            {isPending ? (
              <span className="inline-block h-4 w-24 rounded skeleton-shimmer" />
            ) : (
              <>
                <span className="font-bold text-fg">{total}</span> {total === 1 ? 'item' : 'items'}
              </>
            )}
          </p>
          {total > VIEW_ALL_AFTER ? (
            <Link to={viewAllTo} className="text-sm font-bold text-brand-600 hover:underline">
              View all
            </Link>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <SpotlightRailSkeleton label="Loading sealed products" />
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollRail(-1)}
            aria-label="Scroll sealed products left"
            className="absolute left-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full store-frame store-frame-tile text-fg-muted shadow-md transition-colors hover:text-brand-600 sm:grid"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollRail(1)}
            aria-label="Scroll sealed products right"
            className="absolute right-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full store-frame store-frame-tile text-fg-muted shadow-md transition-colors hover:text-brand-600 sm:grid"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
          <div
            ref={railRef}
            className="store-rail-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-4 pb-2 pl-4 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:scroll-pl-14 sm:pl-14 [&::-webkit-scrollbar]:hidden"
          >
            {lines.map((line) => (
              <SealedProductCard
                key={line.id}
                className="w-40 shrink-0 snap-start sm:w-52"
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
      )}
    </section>
  )
}

export default SealedSpotlightRow

