import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { analyticsAllowed } from '../lib/cookieConsent'
import { initAnalytics, trackPageView } from '../lib/analytics'
import { captureReferralFromSearch } from '../lib/referral'

/** Opt-in analytics + referral capture. Respects cookie consent and GPC. */
export function AnalyticsLoader() {
  const location = useLocation()

  useEffect(() => {
    captureReferralFromSearch(location.search)
  }, [location.search])

  useEffect(() => {
    if (analyticsAllowed()) initAnalytics()
  }, [])

  useEffect(() => {
    function onConsent() {
      if (analyticsAllowed()) initAnalytics()
    }
    window.addEventListener('lgscv-cookie-consent', onConsent)
    return () => window.removeEventListener('lgscv-cookie-consent', onConsent)
  }, [])

  useEffect(() => {
    if (!analyticsAllowed()) return
    trackPageView(`${location.pathname}${location.search}`)
  }, [location.pathname, location.search])

  return null
}

export function notifyCookieConsentChanged(): void {
  window.dispatchEvent(new Event('lgscv-cookie-consent'))
}
