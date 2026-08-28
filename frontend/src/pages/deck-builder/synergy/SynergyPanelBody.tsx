import type { DeckBuilderGroupBy } from '../../../lib/deckBuilder'
import type { DeckRole, DeckCardType, CommanderRecommendation } from '../../../hooks'
import { ROLE_META, TYPE_LABELS, TYPE_ORDER } from '../constants'
import { SynergyGroupedGrid } from './SynergyGroupedGrid'
import { buildSections, type SynergyViewProps } from './types'

export function buildSynergySections(
  groupBy: DeckBuilderGroupBy,
  byRole: Partial<Record<DeckRole, CommanderRecommendation[]>> | undefined,
  byType: Partial<Record<DeckCardType, CommanderRecommendation[]>> | undefined,
) {
  if (groupBy === 'role' && byRole) {
    const labels = Object.fromEntries(
      (Object.keys(ROLE_META) as DeckRole[]).map((role) => [role, ROLE_META[role].label]),
    )
    return buildSections(['enabler', 'fuel', 'payoff', 'support'], labels, byRole)
  }
  if (byType) {
    return buildSections(TYPE_ORDER, TYPE_LABELS, byType)
  }
  return []
}

export function SynergyPanelBody({
  groupBy,
  byRole,
  byType,
  ...viewProps
}: SynergyViewProps & {
  groupBy: DeckBuilderGroupBy
  byRole?: Partial<Record<DeckRole, CommanderRecommendation[]>>
  byType?: Partial<Record<DeckCardType, CommanderRecommendation[]>>
}) {
  const sections = buildSynergySections(groupBy, byRole, byType)
  return <SynergyGroupedGrid sections={sections} groupBy={groupBy} {...viewProps} />
}
