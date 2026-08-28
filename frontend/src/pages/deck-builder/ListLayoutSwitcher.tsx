import type { DeckBuilderGroupBy, DeckBuilderLayout } from '../../lib/deckBuilder'
import { cx } from '../../lib/cx'

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <div
      className="inline-flex rounded-btn border border-border bg-bg p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cx(
            'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
            value === option.id ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ListLayoutSwitcher({
  layout,
  groupBy,
  onLayoutChange,
  onGroupByChange,
}: {
  layout: DeckBuilderLayout
  groupBy: DeckBuilderGroupBy
  onLayoutChange: (layout: DeckBuilderLayout) => void
  onGroupByChange: (groupBy: DeckBuilderGroupBy) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        ariaLabel="Card list layout"
        value={layout}
        options={[
          { id: 'stacks', label: 'Stacks' },
          { id: 'grid', label: 'Grid' },
        ]}
        onChange={onLayoutChange}
      />
      <span className="hidden text-xs font-semibold text-fg-muted sm:inline">Group</span>
      <ToggleGroup
        ariaLabel="Group cards by"
        value={groupBy}
        options={[
          { id: 'type', label: 'Type' },
          { id: 'role', label: 'Role' },
        ]}
        onChange={onGroupByChange}
      />
    </div>
  )
}
