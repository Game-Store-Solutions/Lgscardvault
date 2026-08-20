import type { FinishFilter, SortKey, ViewMode } from '../pages/utils/actionsUtil'

export const STORE_SEARCH_FROM = 'store-search' as const

export type StoreSearchNavState = {
  from: typeof STORE_SEARCH_FROM
  search: string
}

export type StoreSearchSnapshot = {
  q: string
  game: string
  set: string
  type: string
  finish: FinishFilter
  colors: string[]
  min: string
  max: string
  sort: SortKey
  view: ViewMode
  page: number
}

const FINISHES = new Set<FinishFilter>(['all', 'foil', 'nonfoil'])
const SORTS = new Set<SortKey>(['featured', 'price-desc', 'price-asc', 'name', 'newest'])
const VIEWS = new Set<ViewMode>(['grid', 'list'])
const COLOR_PIPS = new Set(['W', 'U', 'B', 'R', 'G', 'C'])

export function isStoreSearchNav(state: unknown): state is StoreSearchNavState {
  if (!state || typeof state !== 'object') return false
  const candidate = state as { from?: unknown; search?: unknown }
  return candidate.from === STORE_SEARCH_FROM && typeof candidate.search === 'string'
}

/** Read storefront filter context from card / artist / set navigation state. */
export function storeSearchFromNavState(state: unknown): StoreSearchNavState | undefined {
  if (isStoreSearchNav(state)) return state
  if (!state || typeof state !== 'object') return undefined
  const nested = (state as { storeSearch?: unknown }).storeSearch
  return isStoreSearchNav(nested) ? nested : undefined
}

/** Attach an active singles search to browse or card links. */
export function withStoreSearchNav<T extends Record<string, unknown>>(
  state: T,
  storeSearch?: StoreSearchNavState | null,
): T & { storeSearch?: StoreSearchNavState } {
  if (!storeSearch) return state
  return { ...state, storeSearch }
}

/** Storefront home, restoring filters when the shopper arrived from a singles search. */
export function storefrontReturnPath(slug: string, storeSearch?: StoreSearchNavState | null): string {
  return storeSearch ? storeSearchPath(slug, storeSearch.search) : `/s/${slug}`
}

/** Storefront pathname plus the current query, so Back lands on the same singles search. */
export function storeSearchPath(slug: string, search = ''): string {
  const query = search.startsWith('?') ? search : search ? `?${search}` : ''
  return `/s/${slug}${query}#store-search`
}

export function parseStoreSearch(params: URLSearchParams): StoreSearchSnapshot {
  const finishRaw = params.get('finish') ?? 'all'
  const sortRaw = params.get('sort') ?? 'featured'
  const viewRaw = params.get('view') ?? 'grid'
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10)

  return {
    q: params.get('q') ?? '',
    game: params.get('game') ?? '',
    set: params.get('set') ?? '',
    type: params.get('type') ?? '',
    finish: FINISHES.has(finishRaw as FinishFilter) ? (finishRaw as FinishFilter) : 'all',
    colors: [...(params.get('colors') ?? '').toUpperCase()].filter((pip) => COLOR_PIPS.has(pip)),
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    sort: SORTS.has(sortRaw as SortKey) ? (sortRaw as SortKey) : 'featured',
    view: VIEWS.has(viewRaw as ViewMode) ? (viewRaw as ViewMode) : 'grid',
    page: Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw : 1,
  }
}

export function serializeStoreSearch(snapshot: StoreSearchSnapshot): URLSearchParams {
  const params = new URLSearchParams()
  if (snapshot.q.trim()) params.set('q', snapshot.q.trim())
  if (snapshot.game) params.set('game', snapshot.game)
  if (snapshot.set) params.set('set', snapshot.set)
  if (snapshot.type) params.set('type', snapshot.type)
  if (snapshot.finish !== 'all') params.set('finish', snapshot.finish)
  if (snapshot.colors.length > 0) params.set('colors', snapshot.colors.join(''))
  if (snapshot.min.trim()) params.set('min', snapshot.min.trim())
  if (snapshot.max.trim()) params.set('max', snapshot.max.trim())
  if (snapshot.sort !== 'featured') params.set('sort', snapshot.sort)
  if (snapshot.view !== 'grid') params.set('view', snapshot.view)
  if (snapshot.page > 1) params.set('page', String(snapshot.page))
  return params
}

/** True when the URL holds a shopper search (not just the default game). */
export function hasActiveStoreSearch(params: URLSearchParams): boolean {
  return Boolean(
    params.get('q') ||
      params.get('set') ||
      params.get('type') ||
      params.get('finish') ||
      params.get('colors') ||
      params.get('min') ||
      params.get('max') ||
      params.get('page'),
  )
}

/** Card links from the storefront only keep filter context when a search is active. */
export function storefrontCardState(
  pathname: string,
  slug: string,
  search: string,
): StoreSearchNavState | undefined {
  if (pathname !== `/s/${slug}` && pathname !== `/s/${slug}/`) return undefined
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!hasActiveStoreSearch(new URLSearchParams(query))) return undefined
  return { from: STORE_SEARCH_FROM, search }
}
