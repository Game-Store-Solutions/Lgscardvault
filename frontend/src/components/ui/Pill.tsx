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
          ? 'bg-brand-500 text-white border-transparent shadow-sm dark:btn-glow'
          : 'border-transparent bg-surface text-fg shadow-sm ring-1 ring-black/[0.05] hover:bg-brand-50/60 hover:text-fg hover:ring-accent-500/35 dark:bg-white/[0.06] dark:ring-white/10 dark:hover:bg-brand-500/10 dark:hover:ring-accent-500/40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
