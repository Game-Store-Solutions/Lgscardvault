import type { InventoryItem } from '../../../api/types'
import type { CommanderRecommendation } from '../../../hooks'
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
  selectable?: boolean
}

export function SynergyCardGrid({
  rows,
  storeSlug,
  picked,
  togglePick,
  openCardPreview,
  selectable = Boolean(storeSlug),
}: SynergyCardGridProps) {
  const previewCards = rows.map((row) => previewFromRecommendation(row, { storeSlug }))

  return (
    <ul className={PUBLIC_FLOATING_CARD_GRID_CLASS}>
      {rows.map((row) => {
        const preview = previewFromRecommendation(row, { storeSlug })
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
