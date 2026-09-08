import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from '../ui'
import { cx } from '../../lib/cx'
import { ProfileCoverEditor } from './ProfileCoverEditor'
import type { ProfileStat } from './ProfileStatistics'

export function ProfileHero({
  displayName,
  avatarUrl,
  title,
  joinedLabel,
  stats,
  actions,
  tabs,
  coverImageUrl,
  coverColor,
  onCoverChange,
  coverSaving,
  coverClassName,
  coverStyle,
  badge,
  footer,
}: {
  displayName: string
  avatarUrl?: string | null
  handle?: string
  title?: string
  joinedLabel?: string
  stats?: Array<Omit<ProfileStat, 'icon'> & { icon?: ProfileStat['icon']; onClick?: () => void }>
  actions?: ReactNode
  tabs?: ReactNode
  coverImageUrl?: string | null
  coverColor?: string | null
  onCoverChange?: (next: { coverImageUrl: string | null; coverColor: string | null }) => void
  coverSaving?: boolean
  coverClassName?: string
  coverStyle?: CSSProperties
  badge?: ReactNode
  footer?: ReactNode
}) {
  const subtitle = [title, joinedLabel].filter(Boolean).join(' · ')
  const [coverOpen, setCoverOpen] = useState(false)
  const coverPanelId = useId()

  useEffect(() => {
    if (!coverOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCoverOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [coverOpen])

  return (
    <div>
      <div className="relative">
        <ProfileCoverArt
          imageUrl={coverImageUrl}
          color={coverColor}
          className={coverClassName}
          style={coverStyle}
        />
        {badge ? <div className="absolute right-4 top-4 sm:right-6 sm:top-5">{badge}</div> : null}
        {onCoverChange ? (
          <div className="absolute bottom-3 right-4 z-10 sm:bottom-4 sm:right-6">
            <button
              type="button"
              aria-expanded={coverOpen}
              aria-controls={coverPanelId}
              onClick={() => setCoverOpen((open) => !open)}
              className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white shadow-sm backdrop-blur-sm hover:bg-black/70"
            >
              {coverOpen ? 'Done' : 'Edit cover'}
            </button>
          </div>
        ) : null}
        {coverOpen && onCoverChange ? (
          <div
            id={coverPanelId}
            className="absolute inset-x-4 bottom-12 z-20 rounded-xl border border-border bg-bg/95 p-4 shadow-lg backdrop-blur-md sm:inset-x-auto sm:right-6 sm:w-80"
          >
            <p className="mb-3 text-sm font-extrabold text-fg">Cover</p>
            <ProfileCoverEditor
              compact
              imageUrl={coverImageUrl}
              color={coverColor}
              saving={coverSaving}
              onSave={onCoverChange}
            />
          </div>
        ) : null}
      </div>

      <div className="px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex flex-col gap-4 pb-5 pt-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:pb-6 sm:pt-6">
          <div className="flex min-w-0 items-end gap-4 sm:gap-5">
            <Avatar
              name={displayName}
              src={avatarUrl ?? undefined}
              size="profile"
              className="relative z-10 -mt-[5.25rem] shrink-0 border-[4px] border-bg shadow-md sm:-mt-[6.5rem]"
            />
            <div className="min-w-0 pb-0.5 sm:pb-1">
              <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                {displayName}
              </h1>
              {subtitle ? <p className="mt-0.5 truncate text-sm font-medium text-fg-muted">{subtitle}</p> : null}
              {stats && stats.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {stats.map((stat) => (
                    <HeroStat key={stat.id} {...stat} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:pb-1">{actions ?? footer}</div>
        </div>

        {tabs ? <div className="-mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10">{tabs}</div> : null}
      </div>
    </div>
  )
}

function HeroStat({
  label,
  value,
  onClick,
}: Omit<ProfileStat, 'icon'> & { onClick?: () => void }) {
  const formatted = typeof value === 'number' ? value.toLocaleString() : value
  const inner = (
    <span className="text-sm">
      <span className="font-extrabold tabular-nums text-fg">{formatted}</span>{' '}
      <span className="font-medium text-fg-muted">{label}</span>
    </span>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-sm text-left hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        {inner}
      </button>
    )
  }

  return inner
}

function ProfileCoverArt({
  imageUrl,
  color,
  className,
  style,
}: {
  imageUrl?: string | null
  color?: string | null
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={{ ...style, ...(color && !imageUrl ? { backgroundColor: color } : undefined) }}
      className={cx(
        'relative h-36 overflow-hidden sm:h-44 lg:h-52',
        !color && !imageUrl
          ? (className ?? 'bg-gradient-to-br from-brand-200 via-brand-100 to-accent-500/35 dark:from-brand-900 dark:via-brand-800 dark:to-brand-950')
          : (className ?? 'bg-brand-900'),
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <ProfileCoverWaves color={color} />
      )}
      {imageUrl && color ? (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(to top, ${color}99, ${color}22)` }}
        />
      ) : null}
    </div>
  )
}

function ProfileCoverWaves({ color }: { color?: string | null }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 118 Q 160 48 320 96 T 640 88 T 800 70 L 800 200 L 0 200 Z"
        className={color ? undefined : 'fill-brand-300/45 dark:fill-brand-700/50'}
        style={color ? { fill: '#ffffff', opacity: 0.18 } : undefined}
      />
      <path
        d="M0 148 Q 200 90 400 132 T 800 110 L 800 200 L 0 200 Z"
        className={color ? undefined : 'fill-surface/70 dark:fill-surface/20'}
        style={color ? { fill: '#ffffff', opacity: 0.12 } : undefined}
      />
    </svg>
  )
}
