import { useMemo, useState } from 'react'
import { cardImageUrl } from '../../api/client'
import {
  CardArtLightbox,
  PUBLIC_FLOATING_CARD_GRID_CLASS,
  PublicFloatingCard,
  type CardArtPreview,
} from '../../components/cards'
import type { SpellbookComboCard } from '../../hooks'

function previewFromComboPiece(piece: SpellbookComboCard): CardArtPreview | null {
  const catalog = piece.inventoryItem?.card
  const rawUrl = piece.imageUrl ?? catalog?.imageUrl
  if (!rawUrl) {
    return null
  }

  return {
    oracleId: piece.oracleId ?? piece.name,
    name: piece.name,
    imageUrl: catalog ? cardImageUrl(catalog) : cardImageUrl({ imageUrl: rawUrl }),
  }
}

function pieceBadge(piece: SpellbookComboCard): string | undefined {
  if (piece.isCommander) return 'CMD'
  if (!piece.inStock) return '—'
  if (piece.quantity > 1) return `×${piece.quantity}`
  return undefined
}

export function ComboPieceGrid({ pieces }: { pieces: SpellbookComboCard[] }) {
  const previews = useMemo(
    () =>
      pieces
        .map((piece) => ({ piece, preview: previewFromComboPiece(piece) }))
        .filter((entry): entry is { piece: SpellbookComboCard; preview: CardArtPreview } => entry.preview !== null),
    [pieces],
  )

  const [lightbox, setLightbox] = useState<{ index: number } | null>(null)

  if (previews.length === 0) {
    return (
      <ul className="mt-3 space-y-1.5">
        {pieces.map((piece) => (
          <li key={piece.name} className="rounded-lg bg-bg px-3 py-2 text-sm text-fg-muted">
            {piece.name}
          </li>
        ))}
      </ul>
    )
  }

  const cards = previews.map((entry) => entry.preview)

  return (
    <>
      <ul className={`mt-3 ${PUBLIC_FLOATING_CARD_GRID_CLASS}`}>
        {previews.map(({ piece, preview }, index) => (
          <PublicFloatingCard
            key={`${preview.oracleId}-${piece.name}`}
            preview={preview}
            badge={pieceBadge(piece)}
            onPreview={() => setLightbox({ index })}
          />
        ))}
      </ul>
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
