import { Navigate, Outlet, useLocation, useMatch } from 'react-router'
import { useKioskMode } from '../../hooks'

/**
 * While kiosk mode is on, only storefront shopping routes for the locked
 * store are allowed. Admin, account, auth, platform, and marketplace pages
 * redirect back to that store's home.
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
        !path.startsWith(`/s/${slug}/account`)))

  if (shoppingAllowed) {
    return <Outlet />
  }

  return <Navigate to={slug ? `/s/${slug}` : '/'} replace />
}
