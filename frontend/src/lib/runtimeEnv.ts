/** True for `vite dev` and other non-production frontend builds. */
export const isDevBuild = import.meta.env.DEV

/** Dev test-order shortcut; optional in staging via VITE_ENABLE_TEST_CHECKOUT=true. */
export const showDevCheckoutTools =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_CHECKOUT === 'true'

/** Where "contact us" goes by default — the platform owners. */
const DEFAULT_CONTACT_EMAILS = ['tedy@gamestoresolutions.com', 'robert@gamestoresolutions.com']

/**
 * Inboxes the landing page's "contact us" section writes to. Override per
 * environment with a comma-separated VITE_CONTACT_EMAILS.
 */
export const contactEmails: string[] = (() => {
  const configured = (import.meta.env.VITE_CONTACT_EMAILS ?? '')
    .split(',')
    .map((email: string) => email.trim())
    .filter((email: string) => email.includes('@'))

  return configured.length > 0 ? configured : DEFAULT_CONTACT_EMAILS
})()
