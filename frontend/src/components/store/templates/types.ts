import type { ReactNode, RefObject } from 'react'
import type { InventoryItem } from '../../../api/types'
import type { StorefrontTemplate } from '../../../lib/storefrontTemplates'

export interface StoreHomeShortcut {
  label: string
  to?: string
  onClick?: () => void
}

export interface StoreHomeChrome {
  slug: string
  name: string
  tagline?: string | null
  heading: string
  subheading: string
  locationLabel?: string | null
  logoUrl?: string | null
  heroImageUrl?: string | null
  heroImageOpacity?: number | null
  heroImagePositionX?: number | null
  heroImagePositionY?: number | null
  heroImagePositionMobileX?: number | null
  heroImagePositionMobileY?: number | null
  primaryColor?: string | null
  accentColor?: string | null
  verified?: boolean
  stats: { listings: number; cards: number; sets: number }
  gameOptions: { code: string; name: string }[]
  gameFilter: string
  onGameChange: (code: string) => void
  onShopSingles: () => void
  shortcuts: StoreHomeShortcut[]
  spotlightItems: InventoryItem[]
  spotlightLoading: boolean
  pinnedIds: number[]
  spotlightMinPriceCents: number
  spotlightEnabled: boolean
  railRef: RefObject<HTMLDivElement | null>
  scrollRail: (direction: 1 | -1) => void
  actions?: ReactNode
}

export interface StoreHomeSlots {
  hero: ReactNode
  promo: ReactNode
  stats: ReactNode
  intro: ReactNode
  shortcuts: ReactNode
  games: ReactNode
  spotlight: ReactNode
  sealed: ReactNode
  browse: ReactNode
  filtersDrawer: ReactNode
}

export interface StoreHomeLayoutProps {
  template: StorefrontTemplate
  chrome: StoreHomeChrome
  slots: StoreHomeSlots
}
