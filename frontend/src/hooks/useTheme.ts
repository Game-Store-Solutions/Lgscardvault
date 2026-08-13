import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
  // Notify every useTheme() subscriber (BrandLogo, charts, toggles, …).
  window.dispatchEvent(new Event('lgscv-theme'))
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener('lgscv-theme', onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener('lgscv-theme', onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

/**
 * Shared light/dark theme — persisted to localStorage and reflected as a
 * `.dark` class on <html>. Uses a cross-component store so logos/icons flip
 * with the toggle (not just CSS tokens).
 * Initial class is set by an inline script in index.html to avoid a flash.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme)

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t)
  }, [])

  const toggleTheme = useCallback(() => {
    applyTheme(readTheme() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggleTheme, setTheme }
}

export default useTheme
