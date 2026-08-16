import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { canManageStore } from '../lib/manageableStores'
import { LoadingPanel } from './ui'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireSuperAdmin?: boolean
  requireStoreOwner?: boolean
  requireStoreManage?: boolean
}

export default function ProtectedRoute({
  children,
  requireSuperAdmin = false,
  requireStoreOwner = false,
  requireStoreManage = false,
}: ProtectedRouteProps) {
  const { user, loading, isSuperAdmin, isStoreOwner } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingPanel label="Loading…" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireStoreManage && !isSuperAdmin) {
    const slug = location.pathname.match(/^\/s\/([^/]+)\/admin/)?.[1]
    if (!canManageStore(user, slug)) {
      return <Navigate to="/" replace />
    }
  }

  if (requireStoreOwner && !isStoreOwner && !isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}
