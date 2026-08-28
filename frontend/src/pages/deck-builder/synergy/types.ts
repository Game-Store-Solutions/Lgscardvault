import type { InventoryItem } from '../../../api/types'
import type { CardArtPreview } from '../../../components/cards'
import type { CommanderRecommendation } from '../../../hooks'
import type { CardPrintingSelection } from '../../../lib/cardPreview'

export interface SynergySection<TRow = CommanderRecommendation> {
  id: string
  label: string
  count: number
  rows: TRow[]
}

export interface SynergyViewProps {
  storeSlug?: string
  picked: Map<string, { oracleId: string; item: InventoryItem | null }>
  togglePick: (oracleId: string, item: InventoryItem | null) => void
  openCardPreview: (cards: CardArtPreview[], oracleId: string) => void
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
  signedIn?: boolean
  cartQtyByInventoryId?: Map<number, number>
  onAdd?: (item: InventoryItem) => void
  cartPending?: boolean
}

export function buildSections<TRow>(
  order: readonly string[],
  labels: Record<string, string>,
  grouped: Record<string, TRow[] | undefined>,
): SynergySection<TRow>[] {
  const sections: SynergySection<TRow>[] = []
  for (const id of order) {
    const rows = grouped[id] ?? []
    if (rows.length === 0) continue
    sections.push({ id, label: labels[id] ?? id, count: rows.length, rows })
  }
  return sections
}
