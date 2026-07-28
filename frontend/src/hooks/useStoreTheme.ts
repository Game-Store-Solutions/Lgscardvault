import { useEffect, useState } from 'react'
import type { Store } from '../api/types'
import { storeThemeVars } from '../lib/storeTheme'

/** Tracks the shopper's light/dark toggle by observing the `.dark` class on <html>. */
function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

/**
 * useStoreTheme — applies a store's branding palette site-wide while a
 * storefront/admin page is mounted by overriding the Tailwind design-token CSS
 * variables on :root. The palette is expanded into a complete, readable set by
 * storeThemeVars (deriving unset neutrals and flipping the brand ramp for dark
 * themes), so the whole UI retones coherently. Previous values are restored on
 * unmount, so the theme never leaks to other pages.
 *
 * When the shopper's theme toggle is dark and the owner configured a dark
 * palette (store.darkColors), those colors override the base branding — the
 * storefront follows the toggle with the owner's own dark look instead of a
 * derived one.
 */
export function useStoreTheme(store?: Store) {
  const isDark = useIsDarkTheme()

  // Serialize the inputs so the effect only re-runs when a branding value changes.
  const key = store
    ? [
        store.primaryColor,
        store.accentColor,
        store.backgroundColor,
        store.surfaceColor,
        store.textColor,
        store.mutedColor,
        store.borderColor,
        isDark ? JSON.stringify(store.darkColors ?? null) : '',
        isDark ? 'dark' : 'light',
      ].join('|')
    : ''

  useEffect(() => {
    if (!store) return
    const dark = store.darkColors ?? {}
    let vars: Record<string, string>
    if (isDark && Object.keys(dark).length > 0) {
      vars = storeThemeVars({ ...store, ...dark })
    } else if (isDark) {
      // Dark toggle without an owner dark palette: apply only the brand
      // colors (ramp flipped for dark) and let the app's default dark
      // tokens style the neutrals. Pinning the light background/surface
      // here as inline styles would override the .dark class and make the
      // theme button appear to do nothing on branded storefronts.
      vars = storeThemeVars({ primaryColor: store.primaryColor, accentColor: store.accentColor }, true)
    } else {
      vars = storeThemeVars(store)
    }
    const root = document.documentElement
    const previous: Record<string, string> = {}

    for (const [variable, value] of Object.entries(vars)) {
      previous[variable] = root.style.getPropertyValue(variable)
      root.style.setProperty(variable, value)
    }

    return () => {
      for (const [variable, value] of Object.entries(previous)) {
        if (value) root.style.setProperty(variable, value)
        else root.style.removeProperty(variable)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

export default useStoreTheme
