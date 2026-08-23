/** localStorage key shared by the banner and any future analytics / Sentry browser SDK. */
export const COOKIE_CONSENT_KEY = 'lgscv-cookie-consent'

export type CookieConsent = 'necessary' | 'all'

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean
  }
}

export function readCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (raw === 'necessary' || raw === 'all') return raw
  } catch {
    // private mode / blocked storage
  }
  return null
}

export function writeCookieConsent(value: CookieConsent): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value)
  } catch {
    // ignore quota
  }
}

/** Global Privacy Control (GPC) — treated as Do Not Sell / Share. */
export function hasGlobalPrivacyControl(): boolean {
  try {
    return navigator.globalPrivacyControl === true
  } catch {
    return false
  }
}

/**
 * Optional pixels (GA, marketing, non-error browser analytics) may load only
 * after the shopper chose Accept all **and** GPC is not set. Necessary cookies
 * and first-party API calls do not use this gate.
 */
export function analyticsAllowed(): boolean {
  if (hasGlobalPrivacyControl()) return false
  return readCookieConsent() === 'all'
}
