import type { InventoryItem } from '../../../api/types'
import type { CommanderRecommendation } from '../../../hooks'
import type { CardPrintingSelection } from '../../../lib/cardPreview'
import {
  PublicFloatingCard,
  PUBLIC_FLOATING_CARD_GRID_CLASS,
  previewFromRecommendation,
  type CardArtPreview,
} from '../../../components/cards'

export interface SynergyCardGridProps {
  rows: CommanderRecommendation[]
  storeSlug?: string
  picked: Map<string, { oracleId: string; item: InventoryItem | null }>
  togglePick: (oracleId: string, item: InventoryItem | null) => void
  openCardPreview: (cards: CardArtPreview[], oracleId: string) => void
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
  selectable?: boolean
}

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

export function SynergyCardGrid({
  rows,
  storeSlug,
  picked,
  togglePick,
  openCardPreview,
  getPrintingSelection,
  selectable = Boolean(storeSlug),
}: SynergyCardGridProps) {
  const previewCards = rows.map((row) =>
    previewFromRecommendation(row, previewOpts(row.card.oracleId, storeSlug, getPrintingSelection)),
  )

  return (
    <ul className={PUBLIC_FLOATING_CARD_GRID_CLASS}>
      {rows.map((row) => {
        const preview = previewFromRecommendation(
          row,
          previewOpts(row.card.oracleId, storeSlug, getPrintingSelection),
        )
        const match = Math.round(row.score * 100)
        const checked = picked.has(row.card.oracleId)
        return (
          <PublicFloatingCard
            key={row.card.oracleId}
            preview={preview}
            selectable={selectable}
            selected={checked}
            checked={checked}
            onToggle={() => togglePick(row.card.oracleId, row.inventoryItem)}
            onPreview={() => openCardPreview(previewCards, row.card.oracleId)}
            badge={`${match}%`}
          />
        )
      })}
    </ul>
  )
}
