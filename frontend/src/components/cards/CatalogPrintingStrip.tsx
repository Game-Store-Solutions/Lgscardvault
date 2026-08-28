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

  return (
    <div className="w-full">
      <p
        className={cx(
          'text-[0.65rem] font-bold uppercase tracking-[0.14em]',
          isLightbox ? 'text-center text-white/45' : 'text-fg-muted',
        )}
      >
        {items.length === 1 ? 'Printing' : 'Available printings'}
      </p>
      <ul
        className={cx(
          'mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          isLightbox ? 'justify-center px-1' : 'justify-start',
        )}
      >
        {items.map((printing) => {
          const active = printing.id === selectedId
          const priceLabel = catalogPrintingPriceLabel(printing)
          const lang = printing.lang?.toLowerCase()

          return (
            <li key={printing.id} className="w-[5.5rem] shrink-0 sm:w-[6.25rem]">
              <button
                type="button"
                onClick={() => onSelect(printing)}
                className={cx(
                  'w-full touch-manipulation overflow-hidden rounded-lg text-left transition-[border-color,box-shadow,transform] duration-200',
                  isLightbox
                    ? active
                      ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-black/80'
                      : 'ring-1 ring-white/15 hover:ring-white/35'
                    : active
                      ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-bg'
                      : 'ring-1 ring-border hover:ring-brand-300',
                )}
              >
                <CardImage
                  src={cardImageUrl(printing)}
                  alt={printing.name}
                  fit="contain"
                  showLabel={false}
                  className="aspect-5/7 w-full bg-bg"
                />
                <span
                  className={cx(
                    'block px-1.5 py-1.5',
                    isLightbox ? 'bg-black/50 text-white' : 'bg-surface text-fg',
                  )}
                >
                  <span className="block truncate text-[0.58rem] font-semibold leading-tight sm:text-[0.62rem]">
                    {printing.setName ?? printing.setCode?.toUpperCase() ?? 'Unknown set'}
                  </span>
                  {priceLabel ? (
                    <span
                      className={cx(
                        'mt-0.5 block text-[0.62rem] font-bold leading-tight sm:text-xs',
                        isLightbox ? 'text-brand-300' : 'text-brand-600',
                      )}
                    >
                      {priceLabel}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[0.58rem] text-fg-muted">—</span>
                  )}
                  {lang && lang !== 'en' && (
                    <span className="mt-0.5 block text-[0.55rem] font-bold uppercase text-fg-muted">{lang}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
