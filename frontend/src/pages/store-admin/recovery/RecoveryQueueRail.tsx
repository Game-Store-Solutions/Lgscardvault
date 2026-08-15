import { Check, CircleSlash } from 'lucide-react'
import type { CsvImportRow, RecoveryErrorGroup } from '../../../api/types'
import { cx } from '../../../lib/cx'
import { shortRowReason } from './shortReason'

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
    <div className="flex h-full min-h-0 flex-col bg-bg/40">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">Queue</p>
        <div className="mt-2 space-y-0.5">
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
                  'flex items-center gap-3 border-l-2 px-3 py-2.5 transition-colors',
                  isActive
                    ? 'border-l-brand-500 bg-surface'
                    : 'border-l-transparent hover:bg-surface/70',
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
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    {[meta, !isSkipped && !isDone ? shortRowReason(row.error) : null].filter(Boolean).join(' · ')}
                  </span>
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
        'flex w-full items-center justify-between gap-3 rounded-btn px-2.5 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-surface hover:text-fg',
      )}
    >
      <span className="min-w-0 truncate font-medium">{label}</span>
      <span className={cx('shrink-0 tabular-nums text-xs', active ? 'text-bg/70' : 'text-fg-muted')}>
        {count}
      </span>
    </button>
  )
}
