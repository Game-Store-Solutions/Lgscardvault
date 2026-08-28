import type { DeckBuilderGroupBy } from '../../../lib/deckBuilder'
import type { AssembledDeckCard } from '../../../hooks'
import type { CardArtPreview } from '../../../components/cards'
import { DeckCardGrid, DeckGroupedGrid } from './DeckCardGrid'
import { groupDeckCards } from './deckGrouping'

export function DeckListBody({
  cards,
  groupBy,
  storeSlug,
  onOpenCardPreview,
}: {
  cards: AssembledDeckCard[]
  groupBy: DeckBuilderGroupBy
  storeSlug?: string
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const sections = groupDeckCards(cards, groupBy)

  if (groupBy === 'role' || sections.length > 1) {
    return (
      <DeckGroupedGrid
        sections={sections}
        storeSlug={storeSlug}
        onOpenCardPreview={onOpenCardPreview}
      />
    )
  }

  return (
    <DeckCardGrid rows={cards} storeSlug={storeSlug} onOpenCardPreview={onOpenCardPreview} />
  )
}
