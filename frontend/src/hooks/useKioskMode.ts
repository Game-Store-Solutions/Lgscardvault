import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'kiosk-mode'
const CHANGE_EVENT = 'kiosk-mode-change'

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Kiosk mode: a platform admin flips the terminal into a locked-down
 * storefront (no nav, just browsing + cart) so customers can ring up their
 * own purchases in-store. Persisted in localStorage so a page refresh at
 * the kiosk doesn't fall back into the admin chrome; a custom event keeps
 * every subscribed component in sync within the tab.
 */
export function useKioskMode() {
  const [enabled, setEnabled] = useState(read)

  useEffect(() => {
    const sync = () => setEnabled(read())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const set = useCallback((value: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      // Storage unavailable (private mode) — state still updates in-tab.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return {
    kioskMode: enabled,
    enterKioskMode: () => set(true),
    exitKioskMode: () => set(false),
  }
}

export default useKioskMode
