import type { DeckBuilderGroupBy } from '../../lib/deckBuilder'
import { cx } from '../../lib/cx'

export function GroupBySwitcher({
  groupBy,
  onChange,
}: {
  groupBy: DeckBuilderGroupBy
  onChange: (groupBy: DeckBuilderGroupBy) => void
}) {
  return (
    <div
      className="inline-flex rounded-btn border border-border bg-bg p-0.5"
      role="group"
      aria-label="Group cards by"
    >
      {(
        [
          { id: 'type', label: 'Type' },
          { id: 'role', label: 'Role' },
        ] as const
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cx(
            'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
            groupBy === option.id ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
