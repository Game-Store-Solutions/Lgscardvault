import type { DeckBuilderGroupBy } from '../../lib/deckBuilder'
import { cx } from '../../lib/cx'

export function GroupBySwitcher({
  groupBy,
  onChange,
  className,
}: {
  groupBy: DeckBuilderGroupBy
  onChange: (groupBy: DeckBuilderGroupBy) => void
  className?: string
}) {
  return (
    <div
      className={cx(
        'inline-flex w-full rounded-btn border border-border bg-bg p-0.5 sm:w-auto',
        className,
      )}
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
            'min-h-9 flex-1 touch-manipulation rounded-btn px-3 py-2 text-xs font-bold transition-colors sm:min-h-0 sm:flex-none sm:px-2.5 sm:py-1',
            groupBy === option.id ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
