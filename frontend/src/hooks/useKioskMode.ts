import { useCallback, useEffect, useState } from 'react'
import {
  clearKioskSession,
  isKioskModeActive,
  readKioskSessionToken,
  readKioskStoreSlug,
  writeKioskSession,
} from '../lib/kioskMode'

const CHANGE_EVENT = 'kiosk-mode-change'

function readEnabled(): boolean {
  return isKioskModeActive()
}

function readSlug(): string | null {
  return readKioskStoreSlug()
}

function readSession(): string | null {
  return readKioskSessionToken()
}

/**
 * Kiosk mode: a store owner flips the terminal into a locked-down
 * storefront (no nav, just browsing + cart) so customers can ring up their
 * own purchases in-store. Persisted in localStorage so a page refresh at
 * the kiosk doesn't fall back into the owner's chrome; a custom event keeps
 * every subscribed component in sync within the tab.
 *
 * A signed kiosk session token (minted at enter) authorizes checkout after
 * the staff JWT expires — no session-expired popup on a customer terminal.
 */
export function useKioskMode() {
  const [enabled, setEnabled] = useState(readEnabled)
  const [storeSlug, setStoreSlug] = useState<string | null>(readSlug)
  const [sessionToken, setSessionToken] = useState<string | null>(readSession)

  useEffect(() => {
    const sync = () => {
      setEnabled(readEnabled())
      setStoreSlug(readSlug())
      setSessionToken(readSession())
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
      // Storage unavailable (private mode) — state still updates in-tab via event.
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
