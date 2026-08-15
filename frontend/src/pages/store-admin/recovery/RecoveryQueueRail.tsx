import { Check, CircleSlash, TriangleAlert } from 'lucide-react'
import type { CsvImportRow, RecoveryErrorGroup } from '../../../api/types'
import { Badge } from '../../../components/ui'
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
 * The work queue.
 *
 * A 500-row import fails for three or four reasons, not 500, so the rail leads
 * with those buckets: fixing "No market price (42)" as a group is a completely
 * different job from hunting one missing printing, and the operator should be
 * able to see which they are in for before they start.
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
      <div className="space-y-1.5 border-b border-border p-3">
        <GroupButton
          label="All unresolved"
          count={total}
          active={activeGroup === null}
          onClick={() => onGroupChange(null)}
        />
        {groups.map((group) => (
          <GroupButton
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

          return (
            <li key={row.rowIndex}>
              <div
                className={cx(
                  'flex items-start gap-2 border-b border-border px-3 py-2 transition-colors',
                  isActive ? 'bg-brand-50/70' : 'hover:bg-bg',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedRowIndexes.includes(row.rowIndex)}
                  onChange={() => onToggleSelected(row.rowIndex)}
                  aria-label={`Select row ${row.rowIndex + 1}`}
                />
                <button
                  type="button"
                  onClick={() => onSelectRow(row.rowIndex)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={cx(
                      'block truncate text-sm font-bold',
                      isSkipped ? 'text-fg-muted line-through' : 'text-fg',
                    )}
                  >
                    {row.name || `Row ${row.rowIndex + 1}`}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    Row {row.rowIndex + 1}
                    {row.set ? ` · ${row.set.toUpperCase()}` : ''}
                    {row.collectorNumber ? ` #${row.collectorNumber}` : ''}
                  </span>
                </button>
                <RowStateIcon done={isDone} skipped={isSkipped} />
              </div>
            </li>
          )
        })}

        {rows.length === 0 && (
          <li className="p-4 text-sm text-fg-muted">
            Nothing left here. Every row in this bucket is resolved or skipped.
          </li>
        )}
      </ul>
    </div>
  )
}

function GroupButton({
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
        'flex w-full items-center justify-between gap-2 rounded-btn px-2.5 py-1.5 text-left text-sm font-bold transition-colors',
        active ? 'bg-brand-500 text-white' : 'text-fg hover:bg-bg',
      )}
    >
      <span className="truncate">{label}</span>
      <Badge tone={active ? 'neutral' : 'danger'}>{count}</Badge>
    </button>
  )
}

function RowStateIcon({ done, skipped }: { done: boolean; skipped: boolean }) {
  if (done) return <Check aria-label="Added" className="mt-0.5 size-4 text-success-700" />
  if (skipped) return <CircleSlash aria-label="Skipped" className="mt-0.5 size-4 text-fg-muted" />
  return <TriangleAlert aria-label="Needs match" className="mt-0.5 size-4 text-danger-700" />
}
