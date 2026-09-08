import { useCallback, useEffect, useState } from 'react'
import {
  clearKioskSession,
  isKioskModeActive,
  readKioskSessionToken,
  readKioskStoreSlug,
  writeKioskSession,
} from '../lib/kioskMode'

const CHANGE_EVENT = 'kiosk-mode-change'

/**
 * Kiosk mode: locked-down customer storefront. A signed session token (minted
 * at enter) keeps checkout working after the staff JWT expires so the terminal
 * never bounces to the login page.
 */
export function useKioskMode() {
  const [enabled, setEnabled] = useState(isKioskModeActive)
  const [storeSlug, setStoreSlug] = useState<string | null>(readKioskStoreSlug)
  const [sessionToken, setSessionToken] = useState<string | null>(readKioskSessionToken)

  useEffect(() => {
    const sync = () => {
      setEnabled(isKioskModeActive())
      setStoreSlug(readKioskStoreSlug())
      setSessionToken(readKioskSessionToken())
    }
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const enterKioskMode = useCallback((slug: string, nextSessionToken: string) => {
    try {
      writeKioskSession(slug, nextSessionToken)
    } catch {
      // Storage unavailable — event still syncs in-tab.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const exitKioskMode = useCallback(() => {
    clearKioskSession()
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return {
    kioskMode: enabled,
    kioskStoreSlug: storeSlug,
    kioskSessionToken: sessionToken,
    enterKioskMode,
    exitKioskMode,
  }
}

export default useKioskMode
