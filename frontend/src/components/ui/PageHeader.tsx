import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { EASE_PREMIUM } from '../motion'
import { useAdminChrome } from '../layout/AdminChromeContext'
import { cx } from '../../lib/cx'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  /** Admin console uses a quieter heading than marketing pages. */
  size?: 'display' | 'console'
}

export function PageHeader({ title, subtitle, actions, className, size }: PageHeaderProps) {
  const inAdmin = useAdminChrome()
  const resolvedSize = size ?? (inAdmin ? 'console' : 'display')
  const instant = inAdmin

  return (
    <motion.div
      initial={instant ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: EASE_PREMIUM }}
      className={cx(
        'flex flex-wrap items-start justify-between gap-4',
        inAdmin ? 'gap-x-6 gap-y-3' : 'items-end',
        className,
      )}
    >
      <div className="min-w-0">
        <h1
          className={
            resolvedSize === 'console'
              ? 'font-display text-xl font-bold tracking-tight text-fg sm:text-2xl'
              : 'text-display-sm sm:text-display-md'
          }
        >
          {title}
        </h1>
        {subtitle != null && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">{subtitle}</p>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}
