import type { AssembledDeckCard } from '../../../hooks'
import {
  PublicFloatingCard,
  PUBLIC_FLOATING_CARD_GRID_CLASS,
  previewFromDeckRow,
  type CardArtPreview,
} from '../../../components/cards'
import type { SynergySection } from '../synergy/types'

export function DeckCardGrid({
  rows,
  storeSlug,
  onOpenCardPreview,
}: {
  rows: AssembledDeckCard[]
  storeSlug?: string
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const previewCards = rows.map((row) => previewFromDeckRow(row, { storeSlug }))

  return (
    <ul className={PUBLIC_FLOATING_CARD_GRID_CLASS}>
      {rows.map((row) => {
        const preview = previewFromDeckRow(row, { storeSlug })
        const badge =
          row.quantity > 1
            ? `${row.quantity}×`
            : row.gameChanger
              ? 'GC'
              : !row.inventoryItem && storeSlug
                ? '—'
                : undefined
        return (
          <PublicFloatingCard
            key={row.card.oracleId}
            preview={preview}
            onPreview={() => onOpenCardPreview(previewCards, row.card.oracleId)}
            badge={badge}
          />
        )
      })}
    </ul>
  )
}

export function DeckGroupedGrid({
  sections,
  storeSlug,
  onOpenCardPreview,
}: {
  sections: SynergySection<AssembledDeckCard>[]
  storeSlug?: string
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.id}>
          <h2 className="mb-3 font-display text-lg font-extrabold text-fg">
            {section.label}
            <span className="ml-2 text-sm font-semibold text-fg-muted">{section.count}</span>
          </h2>
          <DeckCardGrid
            rows={section.rows}
            storeSlug={storeSlug}
            onOpenCardPreview={onOpenCardPreview}
          />
        </section>
      ))}
    </div>
  )
}
