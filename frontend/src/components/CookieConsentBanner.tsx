import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from './ui'
import { readCookieConsent, writeCookieConsent } from '../lib/cookieConsent'

/**
 * Necessary-cookies notice. The app does not load advertising or analytics
 * pixels today; the choice is stored so a future tracker cannot fire until
 * the shopper opts in (`analyticsAllowed()`). California residents get a
 * Do Not Sell path.
 */
export function CookieConsentBanner() {
  const [open, setOpen] = useState(() => readCookieConsent() === null)

  function choose(value: 'necessary' | 'all') {
    writeCookieConsent(value)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-border bg-surface/95 p-4 shadow-[0_-12px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl text-sm leading-6 text-fg">
          <p id="cookie-consent-title" className="font-display text-base font-bold">
            Cookies
          </p>
          <p className="mt-1 text-fg-muted">
            We use necessary cookies to run sign-in, checkout, and security. We do not run advertising
            cookies. Optional analytics would only load if you choose Accept all.{' '}
            <Link to="/privacy" className="font-semibold text-brand-600 hover:underline">
              Privacy Policy
            </Link>
            {' · '}
            <Link to="/privacy-request" className="font-semibold text-brand-600 hover:underline">
              Do Not Sell or Share
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => choose('necessary')}>
            Necessary only
          </Button>
          <Button size="sm" onClick={() => choose('all')}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  )
}
