import { Layers, Sparkles, Wand2 } from 'lucide-react'
import type { TabItem } from '../../components/ui'

export const DECK_BUILDER_TABS: TabItem[] = [
  { id: 'synergy', label: 'Synergies', icon: Sparkles },
  { id: 'combos', label: 'Combos', icon: Wand2 },
  {
    id: 'deck',
    label: (
      <>
        <span className="sm:hidden">Deck</span>
        <span className="hidden sm:inline">100-card deck</span>
      </>
    ),
    icon: Layers,
  },
]
