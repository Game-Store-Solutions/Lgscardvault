import { useLocation } from 'react-router'
import { storefrontCardState, storeSearchFromNavState, type StoreSearchNavState } from '../lib/storeSearch'

export function inventoryItemPath(slug: string, id: number): string {
  return `/s/${slug}/cards/${id}`
}

/** Card links from the storefront singles search keep filters in history state. */
export function useInventoryItemLink(slug: string): {
  to: (id: number) => string
  state: StoreSearchNavState | undefined
} {
  const location = useLocation()
  return {
    to: (id: number) => inventoryItemPath(slug, id),
    state: storefrontCardState(location.pathname, slug, location.search) ?? storeSearchFromNavState(location.state),
  }
}
