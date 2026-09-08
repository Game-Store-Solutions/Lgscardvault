/**
 * Session-expiry bus so the axios interceptor can notify React without a cycle.
 * Announce is idempotent until the next successful login.
 */

type Listener = () => void

const listeners = new Set<Listener>()
let announced = false

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function announceSessionExpired(): void {
  if (announced) return
  announced = true
  listeners.forEach((listener) => listener())
}

export function resetSessionExpiry(): void {
  announced = false
}

export function isSessionExpiryAnnounced(): boolean {
  return announced
}
