import type { CSSProperties, ReactNode } from 'react'
import { Avatar } from '../ui'
import { cx } from '../../lib/cx'

export function ProfileHero({
  displayName,
  avatarUrl,
  handle,
  joinedLabel,
  coverClassName,
  coverStyle,
  badge,
  footer,
}: {
  displayName: string
  avatarUrl?: string | null
  handle?: string
  joinedLabel?: string
  coverClassName?: string
  coverStyle?: CSSProperties
  badge?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div
        style={coverStyle}
        className={cx(
          'relative flex min-h-[9.5rem] items-center justify-center px-6 py-8',
          coverClassName ?? 'bg-gradient-to-b from-brand-200/70 via-brand-100/40 to-brand-50/30 dark:from-brand-900/50 dark:via-brand-950/30 dark:to-surface',
        )}
      >
        <Avatar
          name={displayName}
          src={avatarUrl ?? undefined}
          className="size-[7.25rem] border-[5px] border-surface text-2xl shadow-md"
        />
        {badge ? <div className="absolute right-4 top-4">{badge}</div> : null}
      </div>
      <div className="border-t border-border px-5 py-5 text-center sm:px-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{displayName}</h1>
        {(handle || joinedLabel) && (
          <p className="mt-1 text-sm font-medium text-fg-muted">
            {handle}
            {handle && joinedLabel ? ' · ' : null}
            {joinedLabel}
          </p>
        )}
        {footer ? <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{footer}</div> : null}
      </div>
    </div>
  )
}
