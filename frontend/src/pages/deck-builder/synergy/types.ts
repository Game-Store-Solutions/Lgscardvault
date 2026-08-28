import type { InventoryItem } from '../../../api/types'
import type { CardArtPreview } from '../../../components/cards'
import type { CommanderRecommendation } from '../../../hooks'

export interface SynergySection {
  id: string
  label: string
  count: number
  rows: CommanderRecommendation[]
}

export interface SynergyViewProps {
  storeSlug?: string
  picked: Map<string, { oracleId: string; item: InventoryItem | null }>
  togglePick: (oracleId: string, item: InventoryItem | null) => void
  openCardPreview: (cards: CardArtPreview[], oracleId: string) => void
  signedIn?: boolean
  cartQtyByInventoryId?: Map<number, number>
  onAdd?: (item: InventoryItem) => void
  cartPending?: boolean
}

export function buildSections(
  order: readonly string[],
  labels: Record<string, string>,
  grouped: Record<string, CommanderRecommendation[] | undefined>,
): SynergySection[] {
  const sections: SynergySection[] = []
  for (const id of order) {
    const rows = grouped[id] ?? []
    if (rows.length === 0) continue
    sections.push({ id, label: labels[id] ?? id, count: rows.length, rows })
  }
  return sections
}
