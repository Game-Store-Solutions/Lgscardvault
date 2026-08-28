import { useMemo, useState } from 'react'
import {
  CardArtLightbox,
  PublicFloatingCard,
  type CardArtPreview,
} from '../../components/cards'
import { Stagger, StaggerItem } from '../../components/motion'
import type { SpellbookComboCard } from '../../hooks'
import type { CardPrintingSelection } from '../../lib/cardPreview'
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
  'mt-3 grid max-w-xl grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] sm:gap-2 md:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))]'

export function ComboPieceGrid({
  pieces,
  storeSlug,
  catalogMode = false,
  getPrintingSelection,
  onSelectPrinting,
}: {
  pieces: SpellbookComboCard[]
  storeSlug?: string
  catalogMode?: boolean
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
  onSelectPrinting?: (oracleId: string, selection: CardPrintingSelection) => void
}) {
  const entries = useMemo(
    () =>
      pieces.map((piece) => {
        const oracleId = piece.oracleId ?? piece.inventoryItem?.card.oracleId ?? piece.name
        return {
          piece,
          preview: buildComboArtPreview(piece, {
            storeSlug,
            printingSelection: getPrintingSelection?.(oracleId),
          }),
        }
      }),
    [pieces, storeSlug, getPrintingSelection],
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
              showPriceOnCard={!storeSlug}
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
          catalogMode={catalogMode}
          onClose={() => setLightbox(null)}
          onIndexChange={(index) => setLightbox({ index })}
          onSelectPrinting={onSelectPrinting}
          selectedPrintingId={(oracleId) => getPrintingSelection?.(oracleId)?.printingId}
        />
      )}
    </>
  )
}
