import type { AssembledDeckCard } from '../../../hooks'
import type { CardPrintingSelection } from '../../../lib/cardPreview'
import {
  PublicFloatingCard,
  PUBLIC_FLOATING_CARD_GRID_CLASS,
  previewFromDeckRow,
  type CardArtPreview,
} from '../../../components/cards'
import type { SynergySection } from '../synergy/types'

function previewOpts(
  oracleId: string,
  storeSlug?: string,
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined,
) {
  return {
    storeSlug,
    printingSelection: getPrintingSelection?.(oracleId),
  }
}

export function DeckCardGrid({
  rows,
  storeSlug,
  getPrintingSelection,
  onOpenCardPreview,
}: {
  rows: AssembledDeckCard[]
  storeSlug?: string
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const previewCards = rows.map((row) =>
    previewFromDeckRow(row, previewOpts(row.card.oracleId, storeSlug, getPrintingSelection)),
  )

  return (
    <ul className={PUBLIC_FLOATING_CARD_GRID_CLASS}>
      {rows.map((row) => {
        const preview = previewFromDeckRow(
          row,
          previewOpts(row.card.oracleId, storeSlug, getPrintingSelection),
        )
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
  getPrintingSelection,
  onOpenCardPreview,
}: {
  sections: SynergySection<AssembledDeckCard>[]
  storeSlug?: string
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
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
            getPrintingSelection={getPrintingSelection}
            onOpenCardPreview={onOpenCardPreview}
          />
        </section>
      ))}
    </div>
  )
}
