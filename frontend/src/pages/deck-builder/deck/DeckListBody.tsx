import type { DeckBuilderGroupBy } from '../../../lib/deckBuilder'
import type { AssembledDeckCard } from '../../../hooks'
import type { CardArtPreview } from '../../../components/cards'
import type { CardPrintingSelection } from '../../../lib/cardPreview'
import { DeckCardGrid, DeckGroupedGrid } from './DeckCardGrid'
import { groupDeckCards } from './deckGrouping'

export function DeckListBody({
  cards,
  groupBy,
  storeSlug,
  getPrintingSelection,
  onOpenCardPreview,
}: {
  cards: AssembledDeckCard[]
  groupBy: DeckBuilderGroupBy
  storeSlug?: string
  getPrintingSelection?: (oracleId: string) => CardPrintingSelection | undefined
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const sections = groupDeckCards(cards, groupBy)

  if (groupBy === 'role' || sections.length > 1) {
    return (
      <DeckGroupedGrid
        sections={sections}
        storeSlug={storeSlug}
        getPrintingSelection={getPrintingSelection}
        onOpenCardPreview={onOpenCardPreview}
      />
    )
  }

  return (
    <DeckCardGrid
      rows={cards}
      storeSlug={storeSlug}
      getPrintingSelection={getPrintingSelection}
      onOpenCardPreview={onOpenCardPreview}
    />
  )
}
