/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, ReactNode } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'
import { Loader2, TriangleAlert, Inbox } from 'lucide-react'
import { cx } from '../../lib/cx'
import { Button } from './Button'

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
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-16 px-6',
        'rounded-card border border-border bg-surface dark:glass-card',
        className,
      )}
    >
      <Spinner size="lg" />
      <p className="text-sm text-fg-muted">{label}</p>
    </div>
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
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-16 px-6 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-bg text-fg-muted">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-fg">{title}</h3>
        {description != null && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {action != null && <div className="mt-2">{action}</div>}
    </div>
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
    <div
      role="alert"
      className={cx(
        'flex flex-col items-center justify-center gap-3 py-16 px-6 text-center',
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
    </div>
  )
}
