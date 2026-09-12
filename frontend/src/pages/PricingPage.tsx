import { Navigate, useLocation } from 'react-router'

/** Old /pricing bookmarks and ads land on the owner page pricing section. */
export default function PricingPage() {
  const { search } = useLocation()

  return <Navigate to={{ pathname: '/for-stores', search, hash: '#pricing' }} replace />
}
