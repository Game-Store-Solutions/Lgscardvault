import { useAuth } from '../context/AuthContext'
import { canManageStore } from '../lib/manageableStores'

/**
 * useCanManageStore — true when the current user may manage the given store:
 * super admin, the owner, or staff with admin access.
 */
export function useCanManageStore(slug?: string): boolean {
  const { user, isSuperAdmin } = useAuth()
  if (isSuperAdmin) return true
  return canManageStore(user, slug)
}

export default useCanManageStore
