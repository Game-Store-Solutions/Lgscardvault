import { analyticsAllowed } from './cookieConsent'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void
  }
}

let initialized = false

function gaId(): string | undefined {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID
  return typeof id === 'string' && id.trim() ? id.trim() : undefined
}

function plausibleDomain(): string | undefined {
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN
  return typeof domain === 'string' && domain.trim() ? domain.trim() : undefined
}

/** Load optional analytics scripts after the shopper opts in. Idempotent. */
export function initAnalytics(): void {
  if (initialized || !analyticsAllowed()) return
  initialized = true

  const ga = gaId()
  if (ga) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`
    document.head.appendChild(script)
    window.gtag = window.gtag ?? function gtag(...args: unknown[]) {
      window.dataLayer = window.dataLayer ?? []
      window.dataLayer.push(args)
    }
    window.gtag('js', new Date())
    window.gtag('config', ga, { send_page_view: false })
  }

  const plausible = plausibleDomain()
  if (plausible) {
    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.dataset.domain = plausible
    script.src = 'https://plausible.io/js/script.js'
    document.head.appendChild(script)
  }
}

export function trackPageView(path: string): void {
  if (!analyticsAllowed()) return
  const ga = gaId()
  if (ga && window.gtag) {
    window.gtag('event', 'page_view', { page_path: path })
  }
  if (plausibleDomain() && window.plausible) {
    window.plausible('pageview', { props: { path } })
  }
}

export function trackEvent(name: string, props?: Record<string, string | number | boolean>): void {
  if (!analyticsAllowed()) return
  const ga = gaId()
  if (ga && window.gtag) {
    window.gtag('event', name, props ?? {})
  }
  if (plausibleDomain() && window.plausible) {
    window.plausible(name, props ? { props } : undefined)
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}
