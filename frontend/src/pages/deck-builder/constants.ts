import { Fuel, Gem, Layers, Zap } from 'lucide-react'
import type { DeckCardType, DeckRole } from '../../hooks'

export const ROLE_META: Record<DeckRole, { label: string; blurb: string; icon: typeof Zap }> = {
  enabler: {
    label: 'Enablers',
    blurb: 'Pieces that start or assemble the strategy.',
    icon: Zap,
  },
  fuel: {
    label: 'Fuel',
    blurb: 'Cards that keep the engine running turn after turn.',
    icon: Fuel,
  },
  payoff: {
    label: 'Payoffs',
    blurb: 'Cards that convert the strategy into wins and value.',
    icon: Gem,
  },
  support: {
    label: 'Support',
    blurb: 'Ramp, draw, interaction, and lands that round out the list.',
    icon: Layers,
  },
}

export const TYPE_ORDER: DeckCardType[] = [
  'creature',
  'enchantment',
  'instant',
  'sorcery',
  'artifact',
  'land',
  'planeswalker',
  'other',
]

export const TYPE_LABELS: Record<DeckCardType, string> = {
  creature: 'Creatures',
  enchantment: 'Enchantments',
  instant: 'Instants',
  sorcery: 'Sorceries',
  artifact: 'Artifacts',
  land: 'Lands',
  planeswalker: 'Planeswalkers',
  other: 'Other',
}

export const PUBLIC_ONBOARDING_STEPS = [
  { step: '01', title: 'Find a commander', body: 'Search the full legal catalog, not just what one store stocks.' },
  { step: '02', title: 'Pick a strategy', body: 'We detect the builds that commander actually supports.' },
  { step: '03', title: 'Build your list', body: 'Get synergy picks, Spellbook combos, and a full 100-card deck.' },
] as const

export const STORE_ONBOARDING_STEPS = [
  { step: '01', title: 'Find a commander', body: 'Search the full legal catalog, not just what is on the shelf.' },
  { step: '02', title: 'Pick a strategy', body: 'We detect the builds that commander actually supports.' },
  { step: '03', title: 'Fill from stock', body: 'Add enablers, fuel, and payoffs that this store has in stock.' },
] as const
