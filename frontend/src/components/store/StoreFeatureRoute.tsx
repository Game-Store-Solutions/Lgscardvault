import { Navigate, useParams } from 'react-router'
import { useStore } from '../../hooks'
import type { StoreFeatureKey } from '../../api/types'
import { isStoreFeatureEnabled } from '../../lib/storeFeatures'
import { StorePageLoader } from './StorePageLoader'

/** Redirects shoppers home when the owner has turned this storefront feature off. */
export function StoreFeatureRoute({
  feature,
  children,
}: {
  feature: StoreFeatureKey
  children: React.ReactNode
}) {
  const { slug = '' } = useParams()
  const { data: store, isLoading, isError } = useStore(slug)

  if (!slug || isError) {
    return <Navigate to="/stores" replace />
  }
  if (isLoading) {
    return <StorePageLoader />
  }
  if (!isStoreFeatureEnabled(store, feature)) {
    return <Navigate to={`/s/${slug}`} replace />
  }

  return children
}
