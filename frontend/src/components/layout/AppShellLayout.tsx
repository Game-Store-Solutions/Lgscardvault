import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

type AppShellLayoutValue = {
  /** When true, main content is edge-to-edge (no max-width / padding / vertical pad). */
  flushMain: boolean
  setFlushMain: (flush: boolean) => void
}

const AppShellLayoutContext = createContext<AppShellLayoutValue | null>(null)

export function AppShellLayoutProvider({
  children,
  routeFlush = false,
}: {
  children: ReactNode
  /** Routes that always flush (card detail, etc.). */
  routeFlush?: boolean
}) {
  const [pageFlush, setFlushMain] = useState(false)
  const flushMain = routeFlush || pageFlush
  const value = useMemo(() => ({ flushMain, setFlushMain }), [flushMain])

  return <AppShellLayoutContext.Provider value={value}>{children}</AppShellLayoutContext.Provider>
}

/** Opt a page into edge-to-edge main (e.g. marketing landing). */
export function useAppShellFlush(flush: boolean) {
  const ctx = useContext(AppShellLayoutContext)
  useLayoutEffect(() => {
    if (!ctx) return
    ctx.setFlushMain(flush)
    return () => ctx.setFlushMain(false)
  }, [ctx, flush])
}

export function useAppShellLayout() {
  return useContext(AppShellLayoutContext)
}
