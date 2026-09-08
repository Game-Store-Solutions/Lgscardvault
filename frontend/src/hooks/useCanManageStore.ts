import { useAuth } from '../context/AuthContext'
import { useKioskMode } from './useKioskMode'
import { canManageStore } from '../lib/manageableStores'

/**
 * useCanManageStore — true when the current user may manage the given store:
 * super admin, the owner, or staff with admin access.
 *
 * Always false in kiosk mode so customer terminals never surface Manage /
 * Admin controls even if a staff JWT is still in localStorage.
 */
export function useCanManageStore(slug?: string): boolean {
  const { user, isSuperAdmin } = useAuth()
  const { kioskMode } = useKioskMode()
  if (kioskMode) return false
  if (isSuperAdmin) return true
  return canManageStore(user, slug)
}

export default useCanManageStore
