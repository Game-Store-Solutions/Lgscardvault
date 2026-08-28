import type { DeckBuilderView } from '../../../lib/deckBuilder'
import { cx } from '../../../lib/cx'

const VIEWS: { id: DeckBuilderView; label: string }[] = [
  { id: 'stacks', label: 'Stacks' },
  { id: 'roles', label: 'By role' },
  { id: 'types', label: 'By type' },
]

export function SynergyViewSwitcher({
  view,
  onChange,
}: {
  view: DeckBuilderView
  onChange: (view: DeckBuilderView) => void
}) {
  return (
    <div className="inline-flex rounded-btn border border-border bg-bg p-0.5">
      {VIEWS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cx(
            'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
            view === option.id ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
