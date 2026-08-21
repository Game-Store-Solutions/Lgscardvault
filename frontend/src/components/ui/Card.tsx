import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { EASE_PREMIUM } from '../motion'
import { cx } from '../../lib/cx'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Opt out of the scroll-in entrance (e.g. inside an already-animated list). */
  animateIn?: boolean
}

/**
 * Card — the app's primary panel, fading up as it mounts so pages feel composed
 * rather than dumped.
 *
 * Deliberately mount-driven rather than scroll-driven: `whileInView` starts at
 * opacity 0 and depends on an intersection callback, so anything that mounts
 * hidden (mid route transition, inside a collapsed panel) could stay invisible
 * until the user scrolled or reloaded. Cards carry the app's actual content, so
 * they must never depend on that.
 */
export function Card({ className, animateIn = true, ...props }: CardProps) {
  const entrance = animateIn
    ? {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: EASE_PREMIUM },
      }
    : {}

  return (
    <motion.div
      className={cx(
        'rounded-card bg-surface shadow-card ring-[length:var(--store-border-width)] ring-black/[0.04] dark:ring-white/10',
        className,
      )}
      {...entrance}
      {...(props as ComponentProps<typeof motion.div>)}
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
      className={cx('flex flex-wrap items-start justify-between gap-4 border-b border-border/80 px-5 py-4', className)}
      {...props}
    >
      {hasSlots ? (
        <>
          <div className="min-w-0">
            {title != null && <h3 className="truncate text-display-xs">{title}</h3>}
            {subtitle != null && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{subtitle}</p>}
          </div>
          {actions != null && (
            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>
          )}
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
      className={cx('flex flex-wrap items-center justify-end gap-2 border-t border-border/80 px-5 py-4', className)}
      {...props}
    />
  )
}
