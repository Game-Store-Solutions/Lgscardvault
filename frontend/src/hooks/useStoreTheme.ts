import { useEffect, useState } from 'react'
import type { Store } from '../api/types'
import { inheritFrameStyles, resolveFrameStyles, storeThemeVars } from '../lib/storeTheme'

/** Content that may inherit a store's branding. Platform chrome stays outside this. */
export const STORE_THEME_CLASS = 'store-theme'

/** Top nav, admin sidebar, and other shell UI that must ignore store branding. */
export const APP_CHROME_CLASS = 'app-chrome'

/** Tracks the shopper's light/dark toggle by observing the `.dark` class on <html>. */
export function useIsDarkTheme(): boolean {
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
 * useStoreTheme — applies a store's branding palette to `.store-theme` regions
 * while a storefront page is mounted. Platform chrome (`.app-chrome`) is
 * outside that region, so the top nav, account menu, and theme toggle never
 * pick up store colors, border thickness, glow, or blur.
 *
 * The palette is expanded into a complete, readable set by storeThemeVars
 * (deriving unset neutrals and flipping the brand ramp for dark themes).
 * Previous values are restored on unmount.
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
        store.borderThickness,
        store.surfaceBlur,
        store.borderGlow,
        JSON.stringify(store.frameStyles ?? null),
        JSON.stringify(store.darkFrameStyles ?? null),
        isDark ? JSON.stringify(store.darkColors ?? null) : '',
        isDark ? 'dark' : 'light',
      ].join('|')
    : ''

  useEffect(() => {
    if (!store) return
    const dark = store.darkColors ?? {}
    const lightFrames = resolveFrameStyles(store.frameStyles, {
      borderThickness: store.borderThickness ?? undefined,
      surfaceBlur: store.surfaceBlur ?? undefined,
      borderGlow: store.borderGlow ?? undefined,
    })
    const frameStyles = isDark
      ? inheritFrameStyles(store.darkFrameStyles, lightFrames)
      : store.frameStyles
    let vars: Record<string, string>
    if (isDark && Object.keys(dark).length > 0) {
      vars = storeThemeVars({ ...store, ...dark, frameStyles })
    } else if (isDark) {
      // Dark toggle without an owner dark palette: apply only the brand
      // colors (ramp flipped for dark) and let the app's default dark
      // tokens style the neutrals. Pinning the light background/surface
      // here as inline styles would override the .dark class and make the
      // theme button appear to do nothing on branded storefronts.
      vars = storeThemeVars({
        primaryColor: store.primaryColor,
        accentColor: store.accentColor,
        borderThickness: store.borderThickness,
        surfaceBlur: store.surfaceBlur,
        borderGlow: store.borderGlow,
        frameStyles,
      }, true)
    } else {
      vars = storeThemeVars(store)
    }

    const roots = Array.from(document.querySelectorAll<HTMLElement>(`.${STORE_THEME_CLASS}`))
    if (roots.length === 0) return

    const previous = roots.map((root) => {
      const snapshot: Record<string, string> = {}
      for (const [variable, value] of Object.entries(vars)) {
        snapshot[variable] = root.style.getPropertyValue(variable)
        root.style.setProperty(variable, value)
      }
      return snapshot
    })

    return () => {
      roots.forEach((root, index) => {
        for (const [variable, value] of Object.entries(previous[index] ?? {})) {
          if (value) root.style.setProperty(variable, value)
          else root.style.removeProperty(variable)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

export default useStoreTheme
