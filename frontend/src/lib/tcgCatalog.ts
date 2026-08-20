import type { CatalogGame } from '../api/types'

export type TcgGameMeta = {
  code: string
  label: string
  shortLabel: string
  accent: string
  image: string
  description: string
}

export const TCG_GAME_META: Record<string, TcgGameMeta> = {
  pokemon: {
    code: 'pokemon',
    label: 'Pokemon',
    shortLabel: 'Pokemon',
    accent: '#ef4444',
    image: '/brand/cards/pkm-charizard.jpg',
    description: 'Illustration rares, chase cards, and sealed hits.',
  },
  mtg: {
    code: 'mtg',
    label: 'Magic: The Gathering',
    shortLabel: 'Magic',
    accent: '#c6a035',
    image: '/brand/cards/mtg-lotus.jpg',
    description: 'Reserved staples, commander heat, and premium foils.',
  },
  yugioh: {
    code: 'yugioh',
    label: 'Yu-Gi-Oh!',
    shortLabel: 'Yu-Gi-Oh!',
    accent: '#8b5cf6',
    image: '/brand/cards/op-ace.jpg',
    description: 'Collectors, tournament staples, and iconic chase printings.',
  },
  onepiece: {
    code: 'onepiece',
    label: 'One Piece',
    shortLabel: 'One Piece',
    accent: '#06b6d4',
    image: '/brand/cards/op-luffy.jpg',
    description: 'Manga hits, flagship leaders, and premium alt arts.',
  },
  lorcana: {
    code: 'lorcana',
    label: 'Disney Lorcana',
    shortLabel: 'Lorcana',
    accent: '#f97316',
    image: '/brand/cards/pkm-mew.jpg',
    description: 'Enchanted cards, staples, and sealed collector picks.',
  },
  dragonball: {
    code: 'dragonball',
    label: 'Dragon Ball',
    shortLabel: 'Dragon Ball',
    accent: '#22c55e',
    image: '/brand/cards/fab-prism.jpg',
    description: 'High-energy collector cards and tournament standouts.',
  },
  fab: {
    code: 'fab',
    label: 'Flesh and Blood',
    shortLabel: 'Flesh & Blood',
    accent: '#10b981',
    image: '/brand/cards/fab-bravo.jpg',
    description: 'Cold foils, majestics, and premium deck pieces.',
  },
  riftbound: {
    code: 'riftbound',
    label: 'Riftbound',
    shortLabel: 'Riftbound',
    accent: '#f43f5e',
    image: '/brand/cards/rb-jinx.jpg',
    description: 'Emerging collector inventory and hard-to-find singles.',
  },
}

export function gameMetaFor(code?: string | null, fallbackName?: string | null): TcgGameMeta {
  const normalized = code?.trim().toLowerCase() || 'other'
  const known = TCG_GAME_META[normalized]
  if (known) return known

  return {
    code: normalized,
    label: fallbackName?.trim() || 'Other TCGs',
    shortLabel: fallbackName?.trim() || 'Other',
    accent: '#71717a',
    image: '/brand/cards/mtg-teferi.jpg',
    description: 'Collector inventory across the broader TCG market.',
  }
}

export function sortGamesForMarketplace(games: CatalogGame[]): CatalogGame[] {
  return [...games].sort((a, b) => {
    const left = gameMetaFor(a.code, a.name)
    const right = gameMetaFor(b.code, b.name)
    return left.shortLabel.localeCompare(right.shortLabel)
  })
}
