import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../lib/cx'

export type ProfileNavItem = {
  id: string
  label: ReactNode
  icon?: ComponentType<{ className?: string }>
  badge?: ReactNode
}

export function ProfileSideNav({
  items,
  value,
  onChange,
  title = 'Profile',
}: {
  items: ProfileNavItem[]
  value: string
  onChange: (id: string) => void
  title?: string
}) {
  return (
    <nav aria-label={title} className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
      <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wide text-fg-muted">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.id === value
          const Icon = item.icon
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  active
                    ? 'border border-brand-200/80 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'border border-transparent text-fg-muted hover:bg-bg hover:text-fg',
                )}
              >
                {Icon ? <Icon aria-hidden className={cx('size-5 shrink-0', active ? 'text-brand-600' : '')} /> : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function ProfileAsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <p className="border-b border-border px-4 py-3 text-sm font-extrabold text-fg">{title}</p>
      <div className="p-2">{children}</div>
    </div>
  )
}

export function ProfileAsideLink({
  to,
  icon: Icon,
  label,
  meta,
}: {
  to: string
  icon: ComponentType<{ className?: string }>
  label: string
  meta?: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-bg"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-bg text-fg-muted">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {meta ? <span className="block truncate text-xs font-medium text-fg-muted">{meta}</span> : null}
      </span>
    </Link>
  )
}
