/** True for `vite dev` and other non-production frontend builds. */
export const isDevBuild = import.meta.env.DEV

/** Dev test-order shortcut; optional in staging via VITE_ENABLE_TEST_CHECKOUT=true. */
export const showDevCheckoutTools =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_CHECKOUT === 'true'

// Contact recipients deliberately live server-side (APP_CONTACT_RECIPIENTS) so
// the team's addresses are never shipped in the frontend bundle.
