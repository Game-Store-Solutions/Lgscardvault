import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

/**
 * FilterPill — toggleable pill for filter rows (JOBIX-style).
 * Controlled via `active`; emit changes through `onClick`.
 */
export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(function FilterPill(
  { active = false, className, type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold',
        'border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        active
          ? 'bg-brand-500 text-white border-brand-500 shadow-sm dark:btn-glow'
          : 'border-border bg-surface text-fg border hover:border-brand-400/50 hover:bg-brand-50/50 hover:text-fg dark:border-white/10 dark:bg-white/[0.06] dark:text-fg/90 dark:hover:border-brand-400/40 dark:hover:bg-brand-500/10 dark:hover:text-fg',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
