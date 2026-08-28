import type { DeckBuilderGroupBy, DeckBuilderLayout } from '../../../lib/deckBuilder'
import type { AssembledDeckCard } from '../../../hooks'
import type { CardArtPreview } from '../../../components/cards'
import { DeckCardGrid, DeckGroupedGrid } from './DeckCardGrid'
import { groupDeckCards } from './deckGrouping'
import { DeckVisualStacks } from './DeckVisualStacks'

export function DeckListBody({
  cards,
  layout,
  groupBy,
  storeSlug,
  onOpenCardPreview,
}: {
  cards: AssembledDeckCard[]
  layout: DeckBuilderLayout
  groupBy: DeckBuilderGroupBy
  storeSlug?: string
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const sections = groupDeckCards(cards, groupBy)

  if (layout === 'stacks') {
    return (
      <DeckVisualStacks
        sections={sections}
        storeSlug={storeSlug}
        onOpenCardPreview={onOpenCardPreview}
      />
    )
  }

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
