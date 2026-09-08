import { Navigate, Outlet, useLocation, useMatch } from 'react-router'
import { useKioskMode } from '../../hooks'

/**
 * While kiosk mode is on, only customer shopping routes for the locked store
 * are allowed: browse, card details, cart, and related storefront pages.
 * Admin, account, auth, platform, and marketplace pages redirect home.
 * Inventory "manage" query params are stripped so edit modals cannot open.
 */
export function KioskRouteGuard() {
  const { kioskMode, kioskStoreSlug } = useKioskMode()
  const location = useLocation()
  const storeMatch = useMatch('/s/:slug/*')
  const exactStoreMatch = useMatch('/s/:slug')
  const pathSlug = storeMatch?.params.slug ?? exactStoreMatch?.params.slug
  const slug = kioskStoreSlug ?? pathSlug ?? null

  if (!kioskMode) {
    return <Outlet />
  }

  const path = location.pathname
  const shoppingAllowed =
    Boolean(slug) &&
    (path === `/s/${slug}` ||
      (path.startsWith(`/s/${slug}/`) &&
        !path.startsWith(`/s/${slug}/admin`) &&
        !path.startsWith(`/s/${slug}/account`) &&
        !path.startsWith(`/s/${slug}/sell`)))

  if (!shoppingAllowed) {
    return <Navigate to={slug ? `/s/${slug}` : '/'} replace />
  }

  // Drop manage=1 (and similar) so card-edit UI cannot be forced via URL.
  const params = new URLSearchParams(location.search)
  if (params.has('manage')) {
    params.delete('manage')
    const search = params.toString()
    return <Navigate to={{ pathname: path, search: search ? `?${search}` : '', hash: location.hash }} replace />
  }

  return <Outlet />
}
