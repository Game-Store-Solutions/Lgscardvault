import type { DeckRole } from '../../../hooks'
import { ROLE_META } from '../constants'
import { SynergyCardGrid } from './SynergyCardGrid'
import type { SynergySection, SynergyViewProps } from './types'

function SectionHeader({
  label,
  count,
  blurb,
  icon: Icon,
}: {
  label: string
  count: number
  blurb?: string
  icon?: typeof ROLE_META.enabler.icon
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      {Icon && (
        <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Icon aria-hidden className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-extrabold text-fg">
          {label}
          <span className="ml-2 text-sm font-semibold text-fg-muted">{count}</span>
        </h2>
        {blurb && <p className="text-xs text-fg-muted">{blurb}</p>}
      </div>
    </div>
  )
}

export function SynergyGroupedGrid({
  sections,
  groupBy,
  ...gridProps
}: SynergyViewProps & { sections: SynergySection[]; groupBy: 'role' | 'type' }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const roleMeta = groupBy === 'role' ? ROLE_META[section.id as DeckRole] : null
        return (
          <section key={section.id}>
            <SectionHeader
              label={section.label}
              count={section.count}
              blurb={roleMeta?.blurb}
              icon={roleMeta?.icon}
            />
            <SynergyCardGrid rows={section.rows} {...gridProps} selectable />
          </section>
        )
      })}
    </div>
  )
}
