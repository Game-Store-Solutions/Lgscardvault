import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'kiosk-mode'
const SLUG_KEY = 'kiosk-store-slug'
const CHANGE_EVENT = 'kiosk-mode-change'

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function readSlug(): string | null {
  try {
    const value = localStorage.getItem(SLUG_KEY)
    return value && value.trim() !== '' ? value.trim() : null
  } catch {
    return null
  }
}

/**
 * Kiosk mode: a store owner flips the terminal into a locked-down
 * storefront (no nav, just browsing + cart) so customers can ring up their
 * own purchases in-store. Persisted in localStorage so a page refresh at
 * the kiosk doesn't fall back into the owner's chrome; a custom event keeps
 * every subscribed component in sync within the tab.
 *
 * Leaving kiosk requires the store's admin-configured exit code (verified
 * server-side). The store slug is stored so route guards can bounce admin
 * URLs back to the storefront even when the path has no slug.
 */
export function useKioskMode() {
  const [enabled, setEnabled] = useState(readEnabled)
  const [storeSlug, setStoreSlug] = useState<string | null>(readSlug)

  useEffect(() => {
    const sync = () => {
      setEnabled(readEnabled())
      setStoreSlug(readSlug())
    }
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const enterKioskMode = useCallback((slug: string) => {
    const trimmed = slug.trim()
    try {
      localStorage.setItem(STORAGE_KEY, '1')
      localStorage.setItem(SLUG_KEY, trimmed)
    } catch {
      // Storage unavailable (private mode) — state still updates in-tab.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const exitKioskMode = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '0')
      localStorage.removeItem(SLUG_KEY)
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return {
    kioskMode: enabled,
    kioskStoreSlug: storeSlug,
    enterKioskMode,
    exitKioskMode,
  }
}

export default useKioskMode
