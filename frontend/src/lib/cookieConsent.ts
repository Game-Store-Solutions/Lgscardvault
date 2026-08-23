/** localStorage key shared by the banner and any future analytics / Sentry browser SDK. */
export const COOKIE_CONSENT_KEY = 'lgscv-cookie-consent'

export type CookieConsent = 'necessary' | 'all'

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

/**
 * Optional pixels (GA, marketing, non-error browser analytics) may load only
 * after the shopper chose Accept all. Necessary cookies and first-party API
 * calls do not use this gate.
 */
export function analyticsAllowed(): boolean {
  return readCookieConsent() === 'all'
}
