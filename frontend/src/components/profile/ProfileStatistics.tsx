import type { ComponentType } from 'react'
import { cx } from '../../lib/cx'

export type ProfileStat = {
  id: string
  label: string
  value: string | number
  icon?: ComponentType<{ className?: string }>
  iconClassName?: string
}

export function ProfileStatistics({ stats }: { stats: ProfileStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <ProfileStatTile key={stat.id} {...stat} />
      ))}
    </div>
  )
}

function ProfileStatTile({ label, value, icon: Icon, iconClassName }: ProfileStat) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-surface px-3 py-5 text-center shadow-sm sm:px-4">
      {Icon ? (
        <span className="grid size-10 place-items-center overflow-hidden">
          <Icon className={cx('size-8', iconClassName ?? 'text-brand-500')} />
        </span>
      ) : null}
      <p className={cx('font-display text-2xl font-extrabold leading-none text-fg', Icon && 'mt-2')}>{value}</p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-fg-muted">{label}</p>
    </div>
  )
}
