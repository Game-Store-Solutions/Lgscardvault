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
          isLightbox ? 'text-white/45' : 'text-fg-muted',
        )}
      >
        {items.length === 1 ? 'Printing' : 'Available printings'}
      </p>
      <ul
        className={cx(
          'mt-3 flex w-full snap-none justify-start gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent',
        )}
      >
        {items.map((printing) => {
          const active = printing.id === selectedId
          const priceLabel = catalogPrintingPriceLabel(printing)
          const lang = printing.lang?.toLowerCase()

          return (
            <li key={printing.id} className="w-[7.25rem] shrink-0 sm:w-[8.5rem]">
              <button
                type="button"
                onClick={() => onSelect(printing)}
                className={cx(
                  'w-full touch-manipulation overflow-hidden rounded-lg text-left transition-[box-shadow,ring-color] duration-200',
                  isLightbox
                    ? active
                      ? 'ring-2 ring-brand-400'
                      : 'ring-1 ring-white/20 hover:ring-white/40'
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
                    'block px-2 py-2',
                    isLightbox ? 'text-white' : 'text-fg',
                  )}
                >
                  <span
                    className={cx(
                      'line-clamp-2 text-[0.65rem] font-semibold leading-snug sm:text-xs',
                      isLightbox && 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
                    )}
                  >
                    {printing.setName ?? printing.setCode?.toUpperCase() ?? 'Unknown set'}
                  </span>
                  {priceLabel ? (
                    <span
                      className={cx(
                        'mt-1 block text-xs font-bold leading-tight sm:text-sm',
                        isLightbox ? 'text-brand-300' : 'text-brand-600',
                      )}
                    >
                      {priceLabel}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-fg-muted">—</span>
                  )}
                  {lang && lang !== 'en' && (
                    <span className="mt-0.5 block text-[0.6rem] font-bold uppercase text-fg-muted">{lang}</span>
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
