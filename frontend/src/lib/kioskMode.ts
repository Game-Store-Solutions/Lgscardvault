/** Shared kiosk flags for axios / auth (outside React). */

const MODE_KEY = 'kiosk-mode'
const SLUG_KEY = 'kiosk-store-slug'
const SESSION_KEY = 'kiosk-session-token'

export function isKioskModeActive(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function readKioskStoreSlug(): string | null {
  try {
    const value = localStorage.getItem(SLUG_KEY)
    return value && value.trim() !== '' ? value.trim() : null
  } catch {
    return null
  }
}

export function readKioskSessionToken(): string | null {
  try {
    const value = localStorage.getItem(SESSION_KEY)
    return value && value.trim() !== '' ? value.trim() : null
  } catch {
    return null
  }
}

export function writeKioskSession(slug: string, sessionToken: string): void {
  localStorage.setItem(MODE_KEY, '1')
  localStorage.setItem(SLUG_KEY, slug.trim())
  localStorage.setItem(SESSION_KEY, sessionToken.trim())
}

export function clearKioskSession(): void {
  try {
    localStorage.setItem(MODE_KEY, '0')
    localStorage.removeItem(SLUG_KEY)
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
