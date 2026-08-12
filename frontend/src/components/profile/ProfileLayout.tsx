import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** Full-bleed profile shell: side nav + main + optional right rail. */
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
        'grid w-full gap-6 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_minmax(14rem,18rem)]',
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
