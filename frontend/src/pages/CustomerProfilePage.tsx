import { Navigate, useParams, useSearchParams } from 'react-router'

const TAB_TO_SECTION: Record<string, string> = {
  profile: 'overview',
  orders: 'orders',
  favorites: 'favorites',
  wantlist: 'wantlist',
  selltrade: 'selltrade',
  credit: 'credit',
  notifications: 'notifications',
}

/**
 * Per-store activity used to live at /s/:slug/account. The profile is now
 * global; this route keeps old links working by forwarding with a store filter.
 */
export default function CustomerProfilePage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? ''
  const section = TAB_TO_SECTION[tab] ?? 'overview'
  const search = new URLSearchParams()
  if (section !== 'overview') search.set('section', section)
  if (slug) search.set('store', slug)
  const qs = search.toString()

  return <Navigate to={qs ? `/account?${qs}` : '/account'} replace />
}
