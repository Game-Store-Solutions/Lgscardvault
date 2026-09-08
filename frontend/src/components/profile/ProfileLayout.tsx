import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { cx } from '../../lib/cx'

/** Full-bleed profile shell: cover + identity, then a page of lists (no floating cards). */
export function ProfileLayout({
  nav,
  header,
  children,
  aside,
  className,
  navTitle = 'My account',
  activeLabel,
  navAlert = false,
}: {
  nav?: ReactNode
  /** Full-width block above the nav/main/aside grid (profile hero). */
  header?: ReactNode
  children: ReactNode
  aside?: ReactNode
  className?: string
  navTitle?: string
  activeLabel?: string
  /** Red dot on the mobile menu button (unread notifications). */
  navAlert?: boolean
}) {
  const [navOpen, setNavOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    setNavOpen(false)
  }, [activeLabel])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [navOpen])

  const drawerNav = isValidElement(nav)
    ? cloneElement(nav as ReactElement<{ title?: string }>, { title: '' })
    : nav

  return (
    <div className={cx('-mx-4 -mt-5 sm:-mx-6 sm:-mt-8 lg:-mx-8 xl:-mx-10', className)}>
      {nav ? (
        <>
          {navOpen ? (
            <button
              type="button"
              aria-label="Close account menu"
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-50 bg-fg/40 lg:hidden"
            />
          ) : null}

          <aside
            id={panelId}
            aria-hidden={!navOpen}
            className={cx(
              'z-[60] flex flex-col bg-bg',
              'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(20rem,88vw)] max-lg:border-r max-lg:border-border max-lg:p-3 max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200',
              'max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
              navOpen ? 'max-lg:translate-x-0' : 'max-lg:pointer-events-none max-lg:-translate-x-full',
              'lg:hidden',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-fg-muted">{navTitle}</p>
              <button
                type="button"
                aria-label="Close account menu"
                onClick={() => setNavOpen(false)}
                className="grid size-9 place-items-center rounded-btn border border-border bg-surface text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{navOpen ? drawerNav : null}</div>
          </aside>
        </>
      ) : null}

      {header}

      <div
        className={cx(
          'grid w-full px-4 sm:px-6 lg:px-8 xl:px-10',
          nav
            ? 'lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_minmax(16rem,19rem)]'
            : aside
              ? 'xl:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]'
              : undefined,
        )}
      >
        {nav ? (
          <div className="sticky top-16 z-20 border-b border-border bg-bg/95 py-2.5 backdrop-blur-md lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                aria-label={`Open ${navTitle} menu`}
                aria-expanded={navOpen}
                aria-controls={panelId}
                className="relative grid size-9 shrink-0 place-items-center rounded-btn border border-border bg-surface text-fg-muted transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Menu aria-hidden className="size-5" />
                {navAlert ? (
                  <span className="absolute right-1 top-1 size-2 rounded-full bg-danger-500 ring-2 ring-bg" />
                ) : null}
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">{navTitle}</p>
                <p className="truncate text-sm font-extrabold text-fg">{activeLabel}</p>
              </div>
            </div>
          </div>
        ) : null}

        {nav ? <aside className="hidden border-r border-border py-8 pr-6 sm:py-10 lg:sticky lg:top-20 lg:block lg:self-start">{nav}</aside> : null}
        <div className={cx('min-w-0 py-8 sm:py-10', aside && 'xl:pr-8')}>{children}</div>
        {aside ? (
          <aside className="hidden min-w-0 divide-y divide-border border-l border-border py-8 pl-8 sm:py-10 xl:sticky xl:top-20 xl:block xl:self-start">
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

export function ProfileSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-lg font-extrabold tracking-tight text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Kept for callers that used boxed panels — now a transparent wrapper. */
export function ProfilePanelCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
