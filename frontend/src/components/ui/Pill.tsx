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
          : 'bg-surface text-fg-muted border-border hover:text-fg hover:border-brand-300 hover:bg-bg dark:glass-card dark:hover:border-brand-500/30 dark:hover:text-fg',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
