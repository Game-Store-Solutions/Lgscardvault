import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { EASE_PREMIUM } from '../motion'
import { cx } from '../../lib/cx'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: EASE_PREMIUM }}
      className={cx('flex flex-wrap items-end justify-between gap-4', className)}
    >
      <div className="min-w-0">
        <h1 className="text-display-sm sm:text-display-md">{title}</h1>
        {subtitle != null && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">{subtitle}</p>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}
