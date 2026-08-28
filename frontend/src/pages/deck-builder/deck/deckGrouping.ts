import type { DeckCardType, DeckRole, AssembledDeckCard } from '../../../hooks'
import { ROLE_META, TYPE_LABELS, TYPE_ORDER } from '../constants'
import { buildSections, type SynergySection } from '../synergy/types'

export function cardTypeFromTypeLine(typeLine?: string | null): DeckCardType {
  const head = (typeLine ?? '').split('—')[0]?.trim().toLowerCase() ?? ''
  if (head.includes('creature')) return 'creature'
  if (head.includes('instant')) return 'instant'
  if (head.includes('sorcery')) return 'sorcery'
  if (head.includes('enchantment')) return 'enchantment'
  if (head.includes('artifact')) return 'artifact'
  if (head.includes('planeswalker')) return 'planeswalker'
  if (head.includes('land')) return 'land'
  return 'other'
}

export function groupDeckCards(
  cards: AssembledDeckCard[],
  groupBy: 'role' | 'type',
): SynergySection<AssembledDeckCard>[] {
  if (groupBy === 'role') {
    const grouped: Partial<Record<DeckRole, AssembledDeckCard[]>> = {}
    for (const row of cards) {
      const role = row.role ?? 'support'
      ;(grouped[role] ??= []).push(row)
    }
    const labels = Object.fromEntries(
      (Object.keys(ROLE_META) as DeckRole[]).map((role) => [role, ROLE_META[role].label]),
    )
    return buildSections(['enabler', 'fuel', 'payoff', 'support'], labels, grouped)
  }

  const grouped: Partial<Record<DeckCardType, AssembledDeckCard[]>> = {}
  for (const row of cards) {
    const type = cardTypeFromTypeLine(row.card.typeLine)
    ;(grouped[type] ??= []).push(row)
  }
  return buildSections(TYPE_ORDER, TYPE_LABELS, grouped)
}
