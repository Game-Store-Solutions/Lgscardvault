import { useCart } from './useCart'
import { useGuestCart } from './useGuestCart'

/** Per-store cart: server-backed when signed in, localStorage when guest. */
export function useStoreCart(slug: string, isAuthenticated: boolean) {
  const authed = useCart(slug, isAuthenticated)
  const guest = useGuestCart(slug, !isAuthenticated)
  return isAuthenticated ? authed : guest
}

export default useStoreCart
