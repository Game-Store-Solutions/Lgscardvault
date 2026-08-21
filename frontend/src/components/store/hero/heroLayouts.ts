import type { HeroLayout } from '../../../api/types'

export interface HeroLayoutOption {
  id: HeroLayout
  title: string
  description: string
  featured?: boolean
  emoji?: string
}

/** Curated hero layouts available in Branding. */
export const HERO_LAYOUT_OPTIONS: HeroLayoutOption[] = [
  {
    id: 'cinematic',
    title: 'Cinematic (classic)',
    description: 'Full-height photo banner with bottom-left copy. The original hero style.',
    featured: true,
    emoji: '🎬',
  },
  {
    id: 'living-inventory',
    title: 'Living inventory',
    description: 'The background is your stock. Cards slide through as recently added and trending.',
    emoji: '📊',
  },
  {
    id: 'trading-table',
    title: 'Trading table',
    description: 'Premium playmat with dice, deck box, and sleeves. Store copy printed on the mat.',
    emoji: '🎴',
  },
  {
    id: 'event-board',
    title: 'Event board',
    description: 'Community cork board on the hero. Customize events under Storefront → Events.',
    emoji: '📅',
  },
  {
    id: 'floating-cards',
    title: 'Floating cards',
    description: '~20 inventory cards drift with parallax and foil shimmer; staples when stock is empty.',
    emoji: '🪄',
  },
]

export const ACTIVE_HERO_LAYOUTS = HERO_LAYOUT_OPTIONS.map((o) => o.id)

const REMOVED_TO_ACTIVE: Record<string, HeroLayout> = {
  'store-story-hero': 'cinematic',
  'collectors-shelf': 'cinematic',
  'open-binder': 'cinematic',
  'store-counter': 'cinematic',
  'planeswalkers-desk': 'trading-table',
  'shipping-station': 'living-inventory',
  'trophy-wall': 'cinematic',
  'convention-booth': 'cinematic',
  'floating-collection': 'floating-cards',
  'library-shelf': 'living-inventory',
  'world-map': 'cinematic',
  'gallery-wall': 'cinematic',
  vault: 'cinematic',
  'command-center': 'cinematic',
  'guild-hall': 'cinematic',
  'mosaic-hero': 'living-inventory',
  'store-window': 'cinematic',
  'day-night-hero': 'cinematic',
  storefront: 'cinematic',
  'featured-card': 'cinematic',
  collection: 'living-inventory',
  'full-art': 'cinematic',
  'trading-desk': 'trading-table',
  mascot: 'cinematic',
  dynamic: 'cinematic',
  video: 'cinematic',
  minimal: 'cinematic',
  banner: 'cinematic',
  spotlight: 'cinematic',
}

export function normalizeHeroLayout(layout?: HeroLayout | string | null): HeroLayout {
  if (!layout) return 'cinematic'
  if (ACTIVE_HERO_LAYOUTS.includes(layout as HeroLayout)) return layout as HeroLayout
  if (layout in REMOVED_TO_ACTIVE) return REMOVED_TO_ACTIVE[layout]!
  return 'cinematic'
}

/** Layouts that manage hero image separately (no shared full-bleed photo layer). */
export function layoutUsesHeroPhotoBackground(layout?: HeroLayout | null): boolean {
  return normalizeHeroLayout(layout) !== 'cinematic'
}
