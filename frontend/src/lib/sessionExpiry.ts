/**
 * Session-expiry bus so the axios interceptor can notify React without a cycle.
 * Announce is idempotent until the next successful login / session extend.
 *
 * The expired JWT is stashed so "Are you still there?" can mint a fresh token
 * without asking for a password.
 */

type Listener = () => void

const listeners = new Set<Listener>()
let announced = false
let resumeToken: string | null = null

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function announceSessionExpired(expiredToken?: string | null): void {
  if (announced) return
  announced = true
  const candidate =
    (expiredToken && expiredToken.trim() !== '' ? expiredToken.trim() : null) ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null)
  if (candidate && !resumeToken) {
    resumeToken = candidate
  }
  listeners.forEach((listener) => listener())
}

export function takeSessionResumeToken(): string | null {
  const token = resumeToken
  resumeToken = null
  return token
}

export function peekSessionResumeToken(): string | null {
  return resumeToken
}

export function resetSessionExpiry(): void {
  announced = false
  resumeToken = null
}

export function isSessionExpiryAnnounced(): boolean {
  return announced
}
