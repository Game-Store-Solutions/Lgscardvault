import { useEffect, useCallback, useState, useMemo } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion } from '../motion'
import { cardImageUrl, formatPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { usePublicCardPrintings } from '../../hooks'
import { listingLabel, buildCardArtPreview, selectionFromCatalogPrinting, type CardPrintingSelection } from '../../lib/cardPreview'
import { CardImage } from './CardImage'
import { cx } from '../../lib/cx'
import { CatalogPrintingStrip } from './CatalogPrintingStrip'

export interface CardArtPreview {
  oracleId: string
  /** Catalog printing id used to load sibling printings. */
  catalogCardId?: string
  selectedPrintingId?: string
  name: string
  imageUrl: string
  typeLine?: string | null
  priceCents?: number | null
  priceLabel?: string
  inventoryOptions?: InventoryItem[]
  storeSlug?: string
}

export function CardArtLightbox({
  cards,
  index,
  onClose,
  onIndexChange,
  catalogMode = false,
  onSelectPrinting,
  selectedPrintingId,
}: {
  cards: CardArtPreview[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
  /** Public deck builder: show catalog printings instead of store stock. */
  catalogMode?: boolean
  onSelectPrinting?: (oracleId: string, selection: CardPrintingSelection) => void
  selectedPrintingId?: (oracleId: string) => string | undefined
}) {
  const card = cards[index]
  const hasPrev = index > 0
  const hasNext = index < cards.length - 1
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null)
  const [activePrintingId, setActivePrintingId] = useState<string | null>(null)

  const isCatalogCard = catalogMode && !card?.storeSlug
  const printingsLookupId =
    card?.selectedPrintingId ?? card?.catalogCardId ?? card?.oracleId ?? undefined
  const printingsQuery = usePublicCardPrintings(printingsLookupId, isCatalogCard)
  const catalogPrintings = printingsQuery.data ?? []

  useEffect(() => {
    setSelectedListingId(null)
    setActivePrintingId(null)
  }, [index, card?.oracleId])

  useEffect(() => {
    if (!card || !isCatalogCard) return
    const preferred =
      selectedPrintingId?.(card.oracleId) ??
      card.selectedPrintingId ??
      card.catalogCardId ??
      catalogPrintings[0]?.id ??
      null
    setActivePrintingId(preferred)
  }, [card, isCatalogCard, selectedPrintingId, catalogPrintings])

  const activeCatalogPrinting = useMemo(
    () => catalogPrintings.find((printing) => printing.id === activePrintingId) ?? null,
    [catalogPrintings, activePrintingId],
  )

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1)
  }, [hasPrev, index, onIndexChange])

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1)
  }, [hasNext, index, onIndexChange])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [goNext, goPrev, onClose])

  if (!card) return null

  const listings = card.inventoryOptions ?? []
  const selectedListing =
    listings.find((item) => item.id === selectedListingId) ?? listings[0] ?? card.inventoryOptions?.[0] ?? null
  const displayImage = isCatalogCard
    ? activeCatalogPrinting
      ? cardImageUrl(activeCatalogPrinting)
      : card.imageUrl
    : selectedListing?.card != null
      ? cardImageUrl(selectedListing.card)
      : card.imageUrl
  const displayPrice = isCatalogCard
    ? activeCatalogPrinting
      ? selectionFromCatalogPrinting(activeCatalogPrinting).priceCents
      : card.priceCents
    : selectedListing?.priceCents ?? card.priceCents ?? listings[0]?.priceCents ?? null
  const displayPriceLabel =
    displayPrice != null ? formatPrice(displayPrice) : card.priceLabel

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] grid size-11 touch-manipulation place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4 sm:top-4 sm:size-10"
          aria-label="Close card preview"
        >
          <X aria-hidden className="size-5" />
        </button>

        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 touch-manipulation place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
            aria-label="Previous card"
          >
            <ChevronLeft aria-hidden className="size-6" />
          </button>
        )}

        <motion.div
          key={card.oracleId}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className={cx(
            'flex max-h-[calc(100dvh-2rem)] w-full flex-col items-center',
            isCatalogCard && catalogPrintings.length > 0
              ? 'max-w-3xl'
              : listings.length > 0
                ? 'max-w-lg'
                : 'max-w-md',
          )}
        >
          <motion.div
            key={activePrintingId ?? selectedListingId ?? 'default'}
            initial={{ opacity: 0.85, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className={cx(
              'w-full overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15',
              isCatalogCard && catalogPrintings.length > 0
                ? 'max-w-[min(100%,16rem)] sm:max-w-[min(100%,20rem)]'
                : 'max-w-[min(100%,14rem)] sm:max-w-[min(100%,18rem)]',
            )}
          >
            <CardImage src={displayImage} alt={card.name} className="aspect-5/7 w-full bg-transparent" fit="contain" />
          </motion.div>
          <div
            className={cx(
              'mt-4 w-full text-center',
              isCatalogCard && catalogPrintings.length > 0 ? 'max-w-3xl px-1' : 'max-w-md',
            )}
          >
            <p className="font-display text-lg font-bold text-white">{card.name}</p>
            {card.typeLine && <p className="mt-1 text-sm text-white/75">{card.typeLine}</p>}
            {displayPriceLabel && (
              <p className="mt-2 text-base font-bold text-brand-300">{displayPriceLabel}</p>
            )}
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              {index + 1} of {cards.length}
            </p>

            {isCatalogCard && (
              <div className="mt-5 w-full text-center">
                <CatalogPrintingStrip
                  items={catalogPrintings}
                  selectedId={activePrintingId}
                  loading={printingsQuery.isLoading}
                  variant="lightbox"
                  onSelect={(printing) => {
                    setActivePrintingId(printing.id)
                    onSelectPrinting?.(card.oracleId, selectionFromCatalogPrinting(printing))
                  }}
                />
              </div>
            )}

            {!isCatalogCard && listings.length > 0 && (
              <div className="mt-4 text-left">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white/45">
                  {listings.length === 1 ? 'In stock here' : 'Variants in stock'}
                </p>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {listings.map((item) => {
                    const active = selectedListing?.id === item.id
                    const row = (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-left text-sm font-medium">
                          {listingLabel(item)}
                          {item.quantity > 1 ? ` · ${item.quantity} avail.` : ''}
                        </span>
                        <span className="shrink-0 font-bold">{formatPrice(item.priceCents)}</span>
                      </span>
                    )
                    const className = cx(
                      'block w-full rounded-lg border px-3 py-2 transition-colors',
                      active
                        ? 'border-brand-400/80 bg-white/15 text-white'
                        : 'border-white/10 bg-white/5 text-white/85 hover:bg-white/10',
                    )

                    if (card.storeSlug) {
                      return (
                        <li key={item.id}>
                          <Link
                            to={`/s/${card.storeSlug}/cards/${item.id}`}
                            className={className}
                            onClick={(event) => {
                              event.preventDefault()
                              setSelectedListingId(item.id)
                            }}
                          >
                            {row}
                          </Link>
                        </li>
                      )
                    }

                    return (
                      <li key={item.id}>
                        <button type="button" className={className} onClick={() => setSelectedListingId(item.id)}>
                          {row}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {card.storeSlug && selectedListing && (
                  <Link
                    to={`/s/${card.storeSlug}/cards/${selectedListing.id}`}
                    className="mt-3 inline-flex text-sm font-semibold text-brand-300 hover:text-brand-200"
                  >
                    View listing →
                  </Link>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 touch-manipulation place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
            aria-label="Next card"
          >
            <ChevronRight aria-hidden className="size-6" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export function previewFromRecommendation(
  row: {
    card: { id?: string; oracleId: string; name: string; typeLine?: string | null; imageUrl?: string | null }
    inventoryItem?: InventoryItem | null
    priceCents?: number | null
    inventoryOptions?: InventoryItem[] | null
  },
  opts?: import('../../lib/cardPreview').BuildCardArtPreviewOptions,
): CardArtPreview {
  return buildCardArtPreview(row, opts)
}

export function previewFromDeckRow(
  row: {
    card: { id?: string; oracleId: string; name: string; typeLine?: string | null; imageUrl?: string | null }
    inventoryItem?: InventoryItem | null
    priceCents?: number | null
    inventoryOptions?: InventoryItem[] | null
  },
  opts?: import('../../lib/cardPreview').BuildCardArtPreviewOptions,
): CardArtPreview {
  return buildCardArtPreview(row, opts)
}

export function cardArtButtonClassName(compact = false) {
  return cx(
    'shrink-0 overflow-hidden rounded-md shadow-sm transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
    compact ? 'w-12 sm:w-14' : 'w-full',
  )
}

/** Responsive grid that reaches 10 columns on large screens. */
export const PUBLIC_FLOATING_CARD_GRID_CLASS =
  'grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'

export function PublicFloatingCard({
  preview,
  selected = false,
  selectable = false,
  checked = false,
  onToggle,
  onPreview,
  badge,
  tag: Tag = 'li',
  showCaption = true,
  showPriceOnCard = false,
  className,
}: {
  preview: CardArtPreview
  selected?: boolean
  selectable?: boolean
  checked?: boolean
  onToggle?: () => void
  onPreview: () => void
  badge?: string
  tag?: 'li' | 'div'
  showCaption?: boolean
  /** Overlay market price on the card art (no background). */
  showPriceOnCard?: boolean
  className?: string
}) {
  return (
    <Tag className={cx('group min-w-0', className)}>
      <div
        className={cx(
          'relative',
          selected && 'rounded-[4.5%/3.5%] ring-2 ring-brand-500 ring-offset-1 ring-offset-bg',
        )}
      >
        {selectable && onToggle && (
          <label
            className="absolute left-1 top-1 z-20 grid size-8 cursor-pointer touch-manipulation place-items-center rounded-md bg-black/60 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/75 sm:size-6"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              className="size-3.5 rounded border-white/40 text-brand-500 focus:ring-brand-500/40"
              checked={checked}
              onChange={onToggle}
              aria-label={`Select ${preview.name}`}
            />
          </label>
        )}
        <button
          type="button"
          onClick={onPreview}
          title={preview.name}
          aria-label={`View ${preview.name}`}
          className={cx(
            'relative block w-full touch-manipulation overflow-hidden rounded-[4.5%/3.5%] bg-bg shadow-md ring-1 ring-black/10',
            'transition duration-200 active:scale-[0.98] [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-xl [@media(hover:hover)]:hover:ring-brand-400/70',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
            'cursor-zoom-in',
          )}
        >
          <CardImage
            src={preview.imageUrl}
            alt={preview.name}
            className="aspect-5/7 w-full"
            fit="contain"
            showLabel={false}
          />
          {badge && (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white">
              {badge}
            </span>
          )}
          {showPriceOnCard && preview.priceLabel && (
            <span className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate text-[0.58rem] font-bold leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] sm:text-[0.62rem]">
              {preview.priceLabel}
            </span>
          )}
        </button>
      </div>
      {showCaption && (
        <>
          <p className="mt-1 truncate px-0.5 text-center text-[0.58rem] font-semibold leading-tight text-fg-muted sm:text-[0.62rem]">
            {preview.name}
          </p>
          {preview.priceLabel && !showPriceOnCard && (
            <p className="truncate px-0.5 text-center text-[0.58rem] font-bold leading-tight text-brand-600 sm:text-[0.62rem]">
              {preview.priceLabel}
            </p>
          )}
        </>
      )}
    </Tag>
  )
}
