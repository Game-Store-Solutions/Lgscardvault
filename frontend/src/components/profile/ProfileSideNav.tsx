import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../lib/cx'

export type ProfileNavItem = {
  id: string
  label: ReactNode
  icon?: ComponentType<{ className?: string }>
  badge?: ReactNode
}

/** High-contrast count pill for profile / account / admin side nav. */
export function ProfileNavBadge({
  count,
  tone = 'brand',
}: {
  count: number
  /** `attention` — open orders / alerts (admin Commerce). */
  tone?: 'brand' | 'attention'
}) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : count
  return (
    <span
      className={cx(
        'ml-auto grid h-6 min-w-6 shrink-0 place-items-center rounded-full border px-1.5',
        'text-[11px] font-bold tabular-nums leading-none shadow-sm',
        tone === 'attention'
          ? cx(
              'border-danger-700/45 bg-danger-500 text-white',
              'dark:border-danger-500/35 dark:bg-danger-500 dark:text-white',
            )
          : cx(
              'border-brand-600/35 bg-brand-500 text-white',
              'dark:border-brand-400/40 dark:bg-brand-500 dark:text-white',
            ),
      )}
    >
      {label}
    </span>
  )
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
                    ? 'border border-brand-300/80 bg-brand-100 text-brand-900 dark:border-brand-500/40 dark:bg-brand-950/60 dark:text-brand-100'
                    : 'border border-transparent text-fg-muted hover:bg-bg hover:text-fg',
                )}
              >
                {Icon ? (
                  <Icon
                    aria-hidden
                    className={cx('size-5 shrink-0', active ? 'text-brand-700 dark:text-brand-300' : '')}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? <span className="ml-auto shrink-0">{item.badge}</span> : null}
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
