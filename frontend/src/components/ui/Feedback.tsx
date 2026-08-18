/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { tv, type VariantProps } from 'tailwind-variants'
import { Loader2, TriangleAlert, Inbox } from 'lucide-react'
import { EASE_PREMIUM } from '../motion'
import { cx } from '../../lib/cx'
import { Button } from './Button'

/** Shared entrance so loading, empty, and error panels read consistently. */
const panelEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.34, ease: EASE_PREMIUM },
}

export const spinnerVariants = tv({
  base: 'animate-spin text-brand-500',
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-6',
      lg: 'size-8',
    },
  },
  defaultVariants: { size: 'md' },
})

export interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string
  label?: string
}

export function Spinner({ size, className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite">
      <Loader2 aria-hidden className={cx(spinnerVariants({ size }), className)} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export interface LoadingPanelProps {
  label?: string
  className?: string
}

export function LoadingPanel({ label = 'Loading…', className }: LoadingPanelProps) {
  return (
    <motion.div
      {...panelEntrance}
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-14 px-6 sm:py-16',
        'rounded-card border border-border bg-surface dark:glass-card',
        className,
      )}
    >
      <Spinner size="lg" />
      <p className="text-sm text-fg-muted">{label}</p>
    </motion.div>
  )
}

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      {...panelEntrance}
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-14 px-6 text-center sm:py-16',
        className,
      )}
    >
      <motion.span
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.34, ease: EASE_PREMIUM, delay: 0.05 }}
        className="flex size-12 items-center justify-center rounded-full bg-bg text-fg-muted"
      >
        <Icon aria-hidden className="size-6" />
      </motion.span>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-fg">{title}</h3>
        {description != null && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {action != null && <div className="mt-2">{action}</div>}
    </motion.div>
  )
}

export interface ErrorStateProps {
  title?: ReactNode
  description?: ReactNode
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <motion.div
      role="alert"
      {...panelEntrance}
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-14 px-6 text-center sm:py-16',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-700">
        <TriangleAlert aria-hidden className="size-6" />
      </span>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-fg">{title}</h3>
        {description != null && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </motion.div>
  )
}
