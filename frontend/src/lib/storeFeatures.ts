import type { Store, StoreFeatureKey } from '../api/types'

export const STORE_FEATURE_KEYS: StoreFeatureKey[] = [
  'events',
  'sellTrade',
  'sealed',
  'caseCards',
  'massSearch',
  'deckBuilder',
  'spotlight',
  'storeCredit',
]

export const STORE_FEATURE_META: Record<StoreFeatureKey, { label: string; description: string }> = {
  events: {
    label: 'Event calendar',
    description: 'Public events page and calendar links on the storefront.',
  },
  sellTrade: {
    label: 'Sell / Trade',
    description: 'Let shoppers submit cards to sell or trade.',
  },
  sealed: {
    label: 'Sealed products',
    description: 'Boxes, bundles, and sealed browse on the storefront.',
  },
  caseCards: {
    label: 'Case Cards',
    description: 'In-store display case browsing for shoppers.',
  },
  massSearch: {
    label: 'Mass search',
    description: 'Paste a list and match it against in-stock singles.',
  },
  deckBuilder: {
    label: 'Deck builder',
    description: 'Commander deck builder using this store\'s inventory.',
  },
  spotlight: {
    label: 'Spotlight',
    description: 'Featured singles rail on the storefront home.',
  },
  storeCredit: {
    label: 'Store credit at checkout',
    description: 'Shoppers can apply store credit when they pay.',
  },
}

export function defaultStoreFeatures(): Record<StoreFeatureKey, boolean> {
  return {
    events: true,
    sellTrade: true,
    sealed: true,
    caseCards: true,
    massSearch: true,
    deckBuilder: true,
    spotlight: true,
    storeCredit: true,
  }
}

export function resolveStoreFeatures(
  raw?: Partial<Record<StoreFeatureKey, boolean>> | null,
): Record<StoreFeatureKey, boolean> {
  const resolved = defaultStoreFeatures()
  if (!raw) return resolved
  for (const key of STORE_FEATURE_KEYS) {
    if (typeof raw[key] === 'boolean') resolved[key] = raw[key]
  }
  return resolved
}

export function isStoreFeatureEnabled(
  store: Pick<Store, 'features'> | null | undefined,
  key: StoreFeatureKey,
): boolean {
  return resolveStoreFeatures(store?.features)[key]
}
