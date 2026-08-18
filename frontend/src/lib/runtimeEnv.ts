/** True for `vite dev` and other non-production frontend builds. */
export const isDevBuild = import.meta.env.DEV

/** Dev test-order shortcut; optional in staging via VITE_ENABLE_TEST_CHECKOUT=true. */
export const showDevCheckoutTools =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_CHECKOUT === 'true'

/**
 * Inboxes the landing page's "contact us" section writes to, set as a
 * comma-separated list in VITE_CONTACT_EMAILS. Left empty the section points at
 * store signup instead — better than a mailto to an address nobody reads.
 */
export const contactEmails: string[] = (import.meta.env.VITE_CONTACT_EMAILS ?? '')
  .split(',')
  .map((email: string) => email.trim())
  .filter((email: string) => email.includes('@'))
