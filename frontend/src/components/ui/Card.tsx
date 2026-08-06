import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'

export type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cx(
        'bg-surface border border-border rounded-card shadow-card',
        className,
      )}
      {...props}
    />
  )
}

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
  children,
  ...props
}: CardHeaderProps) {
  const hasSlots = title != null || subtitle != null || actions != null
  return (
    <div
      className={cx('flex items-start justify-between gap-4 px-5 py-4 border-b border-border', className)}
      {...props}
    >
      {hasSlots ? (
        <>
          <div className="min-w-0">
            {title != null && <h3 className="font-display text-lg font-bold text-fg truncate">{title}</h3>}
            {subtitle != null && <p className="text-sm text-fg-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </>
      ) : (
        children
      )}
    </div>
  )
}

export type CardBodyProps = HTMLAttributes<HTMLDivElement>

export function CardBody({ className, ...props }: CardBodyProps) {
  return <div className={cx('px-5 py-4', className)} {...props} />
}

export type CardFooterProps = HTMLAttributes<HTMLDivElement>

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={cx('flex items-center justify-end gap-2 px-5 py-4 border-t border-border', className)}
      {...props}
    />
  )
}
