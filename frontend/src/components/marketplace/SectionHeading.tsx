import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

type SectionHeadingProps = {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  action?: ReactNode
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  action,
  className,
}: SectionHeadingProps) {
  const centered = align === 'center'

  return (
    <div
      className={cx(
        'flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
        centered && 'items-center text-center md:flex-col md:items-center',
        className,
      )}
    >
      <div className={cx('space-y-3', centered && 'max-w-3xl')}>
        {eyebrow ? (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-fg-muted">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-fg sm:text-4xl">
            {title}
          </h2>
          {description ? <p className="max-w-2xl text-sm text-fg-muted sm:text-base">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export default SectionHeading
