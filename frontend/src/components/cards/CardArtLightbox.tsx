import { useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion } from '../motion'
import { cardImageUrl } from '../../api/client'
import { CardImage } from './CardImage'
import { cx } from '../../lib/cx'

export interface CardArtPreview {
  oracleId: string
  name: string
  imageUrl: string
  typeLine?: string | null
}

export function CardArtLightbox({
  cards,
  index,
  onClose,
  onIndexChange,
}: {
  cards: CardArtPreview[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
}) {
  const card = cards[index]
  const hasPrev = index > 0
  const hasNext = index < cards.length - 1

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

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
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
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Close card preview"
        >
          <X aria-hidden className="size-5" />
        </button>

        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
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
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center"
        >
          <div className="w-full max-w-[min(100%,18rem)] overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15">
            <CardImage src={card.imageUrl} alt={card.name} className="aspect-5/7 w-full bg-bg" fit="contain" />
          </div>
          <div className="mt-4 max-w-md text-center">
            <p className="font-display text-lg font-bold text-white">{card.name}</p>
            {card.typeLine && <p className="mt-1 text-sm text-white/75">{card.typeLine}</p>}
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              {index + 1} of {cards.length}
            </p>
          </div>
        </motion.div>

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
            aria-label="Next card"
          >
            <ChevronRight aria-hidden className="size-6" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export function previewFromRecommendation(row: {
  card: { oracleId: string; name: string; typeLine?: string | null; imageUrl?: string | null }
  inventoryItem?: { card: { imageUrl?: string | null; name?: string; typeLine?: string | null } } | null
}): CardArtPreview {
  const catalogCard = row.inventoryItem?.card ?? row.card
  return {
    oracleId: row.card.oracleId,
    name: row.card.name,
    typeLine: row.card.typeLine,
    imageUrl: cardImageUrl(catalogCard),
  }
}

export function previewFromDeckRow(row: {
  card: { oracleId: string; name: string; typeLine?: string | null; imageUrl?: string | null }
  inventoryItem?: { card: { name?: string; typeLine?: string | null; imageUrl?: string | null } } | null
}): CardArtPreview {
  const catalogCard = row.inventoryItem?.card ?? row.card
  return {
    oracleId: row.card.oracleId,
    name: row.inventoryItem?.card.name ?? row.card.name,
    typeLine: row.inventoryItem?.card.typeLine ?? row.card.typeLine,
    imageUrl: cardImageUrl(catalogCard),
  }
}

export function cardArtButtonClassName(compact = false) {
  return cx(
    'shrink-0 overflow-hidden rounded-md shadow-sm transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
    compact ? 'w-12 sm:w-14' : 'w-full',
  )
}
