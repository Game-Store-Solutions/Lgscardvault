import { cardImageUrl, formatPrice, scryfallPriceCents } from '../../api/client'
import type { CardSummary } from '../../api/types'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'

function marketFinish(card: CardSummary): 'nonfoil' | 'foil' | 'etched' {
  const finishes = card.finishes ?? []
  if (finishes.includes('nonfoil')) return 'nonfoil'
  if (finishes.includes('foil')) return 'foil'
  if (finishes.includes('etched')) return 'etched'
  return 'nonfoil'
}

export function catalogPrintingPriceLabel(card: CardSummary): string | undefined {
  const cents = scryfallPriceCents(card, marketFinish(card))
  return cents == null ? undefined : formatPrice(cents)
}

export function CatalogPrintingStrip({
  items,
  selectedId,
  onSelect,
  loading = false,
  variant = 'lightbox',
}: {
  items: CardSummary[]
  selectedId: string | null
  onSelect: (card: CardSummary) => void
  loading?: boolean
  variant?: 'lightbox' | 'surface'
}) {
  if (loading) {
    return (
      <p className={cx('text-center text-sm', variant === 'lightbox' ? 'text-white/60' : 'text-fg-muted')}>
        Loading printings…
      </p>
    )
  }

  if (items.length === 0) {
    return null
  }

  const isLightbox = variant === 'lightbox'
  const scrollClassName =
    'overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

  return (
    <div className={cx('w-full', isLightbox && 'flex min-h-0 flex-1 flex-col')}>
      <p
        className={cx(
          'shrink-0 text-center text-[0.65rem] font-bold uppercase tracking-[0.14em]',
          isLightbox ? 'text-white/45' : 'text-fg-muted',
        )}
      >
        {items.length === 1 ? 'Printing' : 'Available printings'}
      </p>
      <div
        className={cx(
          isLightbox
            ? cx('mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain py-0.5', scrollClassName)
            : undefined,
        )}
      >
        <ul
          className={cx(
            isLightbox
              ? 'grid grid-cols-3 items-start justify-items-center gap-x-2 gap-y-3 px-0.5 sm:grid-cols-4 sm:gap-x-3 sm:gap-y-4 md:grid-cols-5 lg:grid-cols-6'
              : 'mt-4 flex flex-wrap items-start justify-center gap-x-4 gap-y-5',
          )}
        >
        {items.map((printing) => {
          const active = printing.id === selectedId
          const priceLabel = catalogPrintingPriceLabel(printing)
          const lang = printing.lang?.toLowerCase()

          return (
            <li key={printing.id} className={isLightbox ? 'w-full max-w-[5.5rem] sm:max-w-24' : 'w-[5.75rem] sm:w-24'}>
              <button
                type="button"
                onClick={() => onSelect(printing)}
                className="group flex w-full touch-manipulation flex-col items-center gap-1.5 text-center"
              >
                <div
                  className={cx(
                    'relative aspect-5/7 w-full overflow-hidden rounded-xl shadow-2xl transition-[box-shadow,ring-color] duration-200',
                    isLightbox
                      ? active
                        ? 'shadow-brand-500/20 ring-2 ring-brand-400'
                        : 'ring-1 ring-white/15 group-hover:ring-white/35'
                      : active
                        ? 'ring-2 ring-brand-500 shadow-md'
                        : 'ring-1 ring-border shadow-sm group-hover:ring-brand-300',
                  )}
                >
                  <CardImage
                    src={cardImageUrl(printing)}
                    alt={printing.name}
                    fit="contain"
                    showLabel={false}
                    className="absolute inset-0 h-full w-full bg-transparent"
                  />
                </div>
                <span
                  className={cx(
                    'line-clamp-2 w-full px-0.5 text-[0.62rem] font-medium leading-snug sm:text-xs',
                    isLightbox
                      ? 'text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'
                      : 'text-fg-muted',
                  )}
                >
                  {printing.setName ?? printing.setCode?.toUpperCase() ?? 'Unknown set'}
                </span>
                {priceLabel ? (
                  <span
                    className={cx(
                      'text-xs font-bold leading-none sm:text-sm',
                      isLightbox ? 'text-brand-300' : 'text-brand-600',
                    )}
                  >
                    {priceLabel}
                  </span>
                ) : (
                  <span className={cx('text-xs', isLightbox ? 'text-white/50' : 'text-fg-muted')}>—</span>
                )}
                {lang && lang !== 'en' && (
                  <span
                    className={cx(
                      'text-[0.6rem] font-bold uppercase',
                      isLightbox ? 'text-white/45' : 'text-fg-muted',
                    )}
                  >
                    {lang}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        </ul>
      </div>
    </div>
  )
}
