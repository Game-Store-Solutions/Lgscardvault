import { Search } from 'lucide-react'
import { cx } from '../../lib/cx'

export function CommanderSearchField({
  value,
  onChange,
  fetching,
  compact = false,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  fetching: boolean
  compact?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className={cx('w-full min-w-0', compact && 'lg:max-w-xl lg:flex-1')}>
      {!compact && (
        <p className="mb-2.5 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-fg-muted">
          Search commanders
        </p>
      )}
      <div className="relative">
        <Search
          aria-hidden
          className={cx(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-muted',
            compact ? 'left-3 size-4' : 'left-4 size-5',
          )}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={compact ? 'Change commander…' : 'Atraxa, Krenko, Korvold…'}
          className={cx(
            'w-full border border-border bg-surface text-fg shadow-sm placeholder:text-fg-muted',
            'focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
            compact
              ? 'h-10 rounded-[var(--radius-input)] pl-10 pr-3 text-sm'
              : 'h-14 rounded-full pl-12 pr-5 text-base font-medium',
          )}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Search commanders"
        />
      </div>
      {fetching && value.trim().length >= 2 && (
        <p className="mt-2 text-xs text-fg-muted">Searching catalog…</p>
      )}
    </div>
  )
}
