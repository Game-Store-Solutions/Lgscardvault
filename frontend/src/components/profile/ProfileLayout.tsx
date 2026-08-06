import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** Duolingo-style profile shell: side nav + main column + optional right rail. */
export function ProfileLayout({
  nav,
  children,
  aside,
  className,
}: {
  nav: ReactNode
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        'mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)_minmax(0,17rem)]',
        className,
      )}
    >
      <aside className="lg:sticky lg:top-20 lg:self-start">{nav}</aside>
      <div className="min-w-0 space-y-6">{children}</div>
      {aside ? <aside className="hidden min-w-0 space-y-4 xl:block xl:sticky xl:top-20 xl:self-start">{aside}</aside> : null}
    </div>
  )
}

export function ProfileSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ProfilePanelCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-border bg-surface shadow-sm', className)}>{children}</div>
  )
}
