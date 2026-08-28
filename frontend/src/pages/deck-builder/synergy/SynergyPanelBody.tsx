import type { DeckBuilderView } from '../../../lib/deckBuilder'
import type { DeckRole, DeckCardType, CommanderRecommendation } from '../../../hooks'
import { ROLE_META, TYPE_LABELS, TYPE_ORDER } from '../constants'
import { SynergyGroupedGrid } from './SynergyGroupedGrid'
import { SynergyVisualStacks } from './SynergyVisualStacks'
import { buildSections, type SynergyViewProps } from './types'

export function buildSynergySections(
  view: DeckBuilderView,
  byRole: Partial<Record<DeckRole, CommanderRecommendation[]>> | undefined,
  byType: Partial<Record<DeckCardType, CommanderRecommendation[]>> | undefined,
) {
  if (view === 'roles' && byRole) {
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
  view,
  byRole,
  byType,
  ...viewProps
}: SynergyViewProps & {
  view: DeckBuilderView
  byRole?: Partial<Record<DeckRole, CommanderRecommendation[]>>
  byType?: Partial<Record<DeckCardType, CommanderRecommendation[]>>
}) {
  const sections = buildSynergySections(view, byRole, byType)

  if (view === 'stacks') {
    return <SynergyVisualStacks sections={sections} {...viewProps} />
  }

  if (view === 'roles') {
    return <SynergyGroupedGrid sections={sections} groupBy="role" {...viewProps} />
  }

  return <SynergyGroupedGrid sections={sections} groupBy="type" {...viewProps} />
}
