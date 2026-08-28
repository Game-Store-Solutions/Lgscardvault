import type { DeckBuilderGroupBy } from '../../../lib/deckBuilder'
import type { DeckRole } from '../../../hooks'
import { ROLE_META } from '../constants'
import { SynergyCardGrid, type SynergyCardGridProps } from './SynergyCardGrid'
import type { SynergySection } from './types'

export function SynergyGroupedGrid({
  sections,
  groupBy,
  ...gridProps
}: {
  sections: SynergySection[]
  groupBy: DeckBuilderGroupBy
} & Omit<SynergyCardGridProps, 'rows'>) {
  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const roleMeta = groupBy === 'role' ? ROLE_META[section.id as DeckRole] : null
        const Icon = roleMeta?.icon
        return (
          <section key={section.id}>
            <div className="mb-3 flex items-center gap-3">
              {Icon && (
                <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Icon aria-hidden className="size-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-extrabold text-fg">
                  {section.label}
                  <span className="ml-2 text-sm font-semibold text-fg-muted">{section.count}</span>
                </h2>
                {roleMeta?.blurb && <p className="text-xs text-fg-muted">{roleMeta.blurb}</p>}
              </div>
            </div>
            <SynergyCardGrid {...gridProps} rows={section.rows} selectable />
          </section>
        )
      })}
    </div>
  )
}
