import { useMemo, useState } from 'react'
import {
  CardArtLightbox,
  PublicFloatingCard,
  type CardArtPreview,
} from '../../components/cards'
import { Stagger, StaggerItem } from '../../components/motion'
import type { SpellbookComboCard } from '../../hooks'
import { buildComboArtPreview } from '../../lib/cardPreview'
import { cx } from '../../lib/cx'

function pieceBadge(piece: SpellbookComboCard, storeSlug?: string): string | undefined {
  if (piece.isCommander) return 'CMD'
  if (storeSlug && !piece.inStock) return '—'
  if (piece.quantity > 1) return `×${piece.quantity}`
  return undefined
}

/** Sized for combo pieces (2–4 cards), not full deck grids. */
export const COMBO_PIECE_GRID_CLASS =
  'mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] max-w-xl'

export function ComboPieceGrid({
  pieces,
  storeSlug,
}: {
  pieces: SpellbookComboCard[]
  storeSlug?: string
}) {
  const entries = useMemo(
    () =>
      pieces.map((piece) => ({
        piece,
        preview: buildComboArtPreview(piece, { storeSlug }),
      })),
    [pieces, storeSlug],
  )

  const [lightbox, setLightbox] = useState<{ index: number } | null>(null)
  const cards: CardArtPreview[] = entries.map((entry) => entry.preview)

  return (
    <>
      <Stagger immediate gap={0.05} className={cx('list-none', COMBO_PIECE_GRID_CLASS)} role="list">
        {entries.map(({ piece, preview }, index) => (
          <StaggerItem key={`${preview.oracleId}-${piece.name}`} className="min-w-0">
            <PublicFloatingCard
              tag="div"
              preview={preview}
              badge={pieceBadge(piece, storeSlug)}
              onPreview={() => setLightbox({ index })}
            />
          </StaggerItem>
        ))}
      </Stagger>
      {lightbox && (
        <CardArtLightbox
          cards={cards}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(index) => setLightbox({ index })}
        />
      )}
    </>
  )
}
