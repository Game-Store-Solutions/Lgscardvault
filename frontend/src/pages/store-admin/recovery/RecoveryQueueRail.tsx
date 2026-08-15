import { Check, CircleSlash } from 'lucide-react'
import type { CsvImportRow, RecoveryErrorGroup } from '../../../api/types'
import { cx } from '../../../lib/cx'

export interface RecoveryQueueRailProps {
  rows: CsvImportRow[]
  groups: RecoveryErrorGroup[]
  activeGroup: string | null
  onGroupChange: (reason: string | null) => void
  activeRowIndex: number | null
  onSelectRow: (rowIndex: number) => void
  selectedRowIndexes: number[]
  onToggleSelected: (rowIndex: number) => void
}

/**
 * Compact work queue: reason pills on top, then names. Metadata stays
 * one quiet line so seventy rows do not become a wall of chrome.
 */
export function RecoveryQueueRail({
  rows,
  groups,
  activeGroup,
  onGroupChange,
  activeRowIndex,
  onSelectRow,
  selectedRowIndexes,
  onToggleSelected,
}: RecoveryQueueRailProps) {
  const total = groups.reduce((sum, group) => sum + group.count, 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        <GroupPill
          label="All"
          count={total}
          active={activeGroup === null}
          onClick={() => onGroupChange(null)}
        />
        {groups.map((group) => (
          <GroupPill
            key={group.reason}
            label={group.reason}
            count={group.count}
            active={activeGroup === group.reason}
            onClick={() => onGroupChange(group.reason)}
          />
        ))}
      </div>

      <ul className="min-h-0 flex-1 overflow-auto">
        {rows.map((row) => {
          const isActive = row.rowIndex === activeRowIndex
          const isSkipped = row.status === 'skipped'
          const isDone = row.status === 'imported'
          const meta = [row.set ? row.set.toUpperCase() : null, row.collectorNumber ? `#${row.collectorNumber}` : null]
            .filter(Boolean)
            .join(' ')

          return (
            <li key={row.rowIndex}>
              <div
                className={cx(
                  'flex items-center gap-2 px-2.5 py-1.5 transition-colors',
                  isActive ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-bg',
                )}
              >
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={selectedRowIndexes.includes(row.rowIndex)}
                  onChange={() => onToggleSelected(row.rowIndex)}
                  aria-label={`Select ${row.name || `row ${row.rowIndex + 1}`}`}
                />
                <button
                  type="button"
                  onClick={() => onSelectRow(row.rowIndex)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={cx(
                      'block truncate text-sm',
                      isSkipped ? 'text-fg-muted line-through' : 'font-medium text-fg',
                    )}
                  >
                    {row.name || `Row ${row.rowIndex + 1}`}
                  </span>
                  {meta && <span className="block truncate text-xs text-fg-muted">{meta}</span>}
                </button>
                {isDone && <Check aria-label="Added" className="size-3.5 shrink-0 text-success-700" />}
                {isSkipped && <CircleSlash aria-label="Skipped" className="size-3.5 shrink-0 text-fg-muted" />}
              </div>
            </li>
          )
        })}

        {rows.length === 0 && (
          <li className="p-4 text-sm text-fg-muted">Nothing left in this bucket.</li>
        )}
      </ul>
    </div>
  )
}

function GroupPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-brand-500 text-white' : 'bg-bg text-fg-muted hover:text-fg',
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cx('tabular-nums', active ? 'text-white/80' : 'text-fg-muted')}>{count}</span>
    </button>
  )
}
