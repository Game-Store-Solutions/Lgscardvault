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
 * Failed-card queue: reasons as a vertical filter, then a scannable name list.
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
      <div className="space-y-1 border-b border-border p-3">
        <GroupRow
          label="All"
          count={total}
          active={activeGroup === null}
          onClick={() => onGroupChange(null)}
        />
        {groups.map((group) => (
          <GroupRow
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
                  'flex items-center gap-3 px-3 py-2.5 transition-colors',
                  isActive ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-bg',
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0"
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
                      'block truncate text-sm leading-snug',
                      isSkipped ? 'text-fg-muted line-through' : 'font-medium text-fg',
                    )}
                  >
                    {row.name || `Row ${row.rowIndex + 1}`}
                  </span>
                  {meta && <span className="mt-0.5 block truncate text-xs text-fg-muted">{meta}</span>}
                </button>
                {isDone && <Check aria-label="Added" className="size-4 shrink-0 text-success-700" />}
                {isSkipped && <CircleSlash aria-label="Skipped" className="size-4 shrink-0 text-fg-muted" />}
              </div>
            </li>
          )
        })}

        {rows.length === 0 && (
          <li className="p-5 text-sm text-fg-muted">Nothing left in this bucket.</li>
        )}
      </ul>
    </div>
  )
}

function GroupRow({
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
        'flex w-full items-center justify-between gap-3 rounded-btn px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-brand-500 text-white' : 'text-fg-muted hover:bg-bg hover:text-fg',
      )}
    >
      <span className="min-w-0 truncate font-medium">{label}</span>
      <span className={cx('shrink-0 tabular-nums', active ? 'text-white/80' : 'text-fg-muted')}>{count}</span>
    </button>
  )
}
