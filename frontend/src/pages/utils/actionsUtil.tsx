import { Calendar, ClipboardList, Crown, GalleryHorizontalEnd, Search, WalletCards } from 'lucide-react'

type FinishFilter = 'all' | 'foil' | 'nonfoil'
type SortKey = 'featured' | 'price-desc' | 'price-asc' | 'name' | 'newest'
type ViewMode = 'grid' | 'list'

const DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS = 1000
const SPOTLIGHT_MIN_ITEMS_DEFAULT = 4
const SPOTLIGHT_MAX_ITEMS = 12
const SPOTLIGHT_ITEMS_CAP = 24
const RESULTS_PAGE_SIZE = 24

const COLORS = [
    { key: 'W', label: 'White', dark: true },
    { key: 'U', label: 'Blue', dark: false },
    { key: 'B', label: 'Black', dark: false },
    { key: 'R', label: 'Red', dark: false },
    { key: 'G', label: 'Green', dark: false },
    { key: 'C', label: 'Colorless', dark: true },
] as const

// Primary card types offered by the storefront type-line filter.
const CARD_TYPES = [
    'Creature',
    'Planeswalker',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Battle',
    'Land',
] as const

const FINISH_OPTIONS: { key: FinishFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'nonfoil', label: 'Nonfoil' },
    { key: 'foil', label: 'Foil' },
]

const SORTS: { value: SortKey; label: string }[] = [
    { value: 'featured', label: 'Featured' },
    { value: 'price-desc', label: 'Price: High to Low' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'name', label: 'Name: A–Z' },
    { value: 'newest', label: 'Newest' },
]

// Themed shortcut tiles shown above the spotlight. Entries with a `path` link
// to a store-relative page; the rest are placeholders until their destinations
// are built.
type QuickAction = { label: string; icon: typeof Search; path?: string; action?: 'search' }

/** Canonical storefront copy — import instead of hardcoding strings. */
export const CASE_CARDS_LABEL = 'Case Cards'

const QUICK_ACTIONS: QuickAction[] = [
    { label: 'Search Cards', icon: Search, action: 'search' },
    { label: CASE_CARDS_LABEL, icon: GalleryHorizontalEnd, path: 'case-cards' },
    { label: 'Mass Search', icon: ClipboardList, path: 'mass-search' },
    { label: 'Event calendar', icon: Calendar, path: 'events' },
    { label: 'Deck Builder', icon: Crown, path: 'deck-builder' },
    { label: 'Sell/Trade', icon: WalletCards, path: 'sell' },
]

export {QUICK_ACTIONS, SORTS, CARD_TYPES, FINISH_OPTIONS, COLORS, DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS, SPOTLIGHT_MIN_ITEMS_DEFAULT, SPOTLIGHT_MAX_ITEMS, SPOTLIGHT_ITEMS_CAP, RESULTS_PAGE_SIZE};
export type { ViewMode,SortKey,FinishFilter };
