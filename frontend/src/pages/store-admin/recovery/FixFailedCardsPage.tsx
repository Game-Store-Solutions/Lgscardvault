import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { CircleSlash } from 'lucide-react'
import { extractErrorMessage } from '../../../api/client'
import type { CsvImportRow } from '../../../api/types'
import { BackButton, Button, Card, CardBody, EmptyState, LoadingPanel } from '../../../components/ui'
import { RecoveryQueueRail } from './RecoveryQueueRail'
import { RecoveryRowPanel } from './RecoveryRowPanel'
import { useRecoveryActions, useRecoveryQueue } from './useImportRecovery'

/**
 * Failed-card workspace: a queue on the left, one decision on the right.
 */
export default function FixFailedCardsPage() {
  const { slug = '', importId = '' } = useParams()
  const { data, isLoading, isError } = useRecoveryQueue(slug, importId)
  const { skipRow } = useRecoveryActions(slug, importId)

  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null)
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([])
  const [bulkError, setBulkError] = useState<string | null>(null)

  const allRows = useMemo(() => data?.rows ?? [], [data])

  const visibleRows = useMemo(() => {
    if (activeGroup === null) return allRows
    const group = data?.groups.find((candidate) => candidate.reason === activeGroup)
    if (!group) return allRows
    return allRows.filter((row) => group.rowIndexes.includes(row.rowIndex))
  }, [allRows, activeGroup, data])

  const unresolved = useMemo(
    () => visibleRows.filter((row) => row.status === 'error'),
    [visibleRows],
  )

  useEffect(() => {
    if (visibleRows.length === 0) {
      setActiveRowIndex(null)
      return
    }
    const stillVisible = visibleRows.some((row) => row.rowIndex === activeRowIndex)
    if (!stillVisible) {
      setActiveRowIndex((unresolved[0] ?? visibleRows[0]).rowIndex)
    }
  }, [visibleRows, unresolved, activeRowIndex])

  const activeRow: CsvImportRow | null =
    allRows.find((row) => row.rowIndex === activeRowIndex) ?? null

  function advance() {
    const remaining = unresolved.filter((row) => row.rowIndex !== activeRowIndex)
    const next =
      remaining.find((row) => row.rowIndex > (activeRowIndex ?? -1)) ?? remaining[0] ?? null
    setActiveRowIndex(next?.rowIndex ?? null)
  }

  function toggleSelected(rowIndex: number) {
    setSelectedRowIndexes((current) =>
      current.includes(rowIndex)
        ? current.filter((index) => index !== rowIndex)
        : [...current, rowIndex],
    )
  }

  async function skipSelected() {
    setBulkError(null)
    const targets = allRows.filter(
      (row) => selectedRowIndexes.includes(row.rowIndex) && row.status === 'error',
    )
    try {
      for (const row of targets) {
        await skipRow.mutateAsync({ rowIndex: row.rowIndex, skipped: true })
      }
      setSelectedRowIndexes([])
    } catch (error) {
      setBulkError(extractErrorMessage(error, 'Could not skip those rows.'))
    }
  }

  if (isLoading) return <LoadingPanel label="Loading failed cards..." />
  if (isError || !data) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="Could not load this import" description="Refresh and try again." />
        </CardBody>
      </Card>
    )
  }

  const outstanding = data.groups.reduce((sum, group) => sum + group.count, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <BackButton to={`/s/${slug}/admin/imports/${importId}`}>Back to import run</BackButton>
          <h1 className="mt-1 font-display text-2xl font-bold text-fg">Fix failed cards</h1>
        </div>
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{outstanding}</span> left
          <span className="mx-2 text-border">·</span>
          {data.counts.imported} added
          {data.counts.skipped > 0 && (
            <>
              <span className="mx-2 text-border">·</span>
              {data.counts.skipped} skipped
            </>
          )}
        </p>
      </div>

      {selectedRowIndexes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
          <p className="text-sm font-medium text-fg">{selectedRowIndexes.length} selected</p>
          <Button variant="secondary" size="sm" loading={skipRow.isPending} onClick={() => void skipSelected()}>
            <CircleSlash aria-hidden className="size-4" />
            Skip selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedRowIndexes([])}>
            Clear
          </Button>
        </div>
      )}

      {bulkError && (
        <p role="alert" className="text-sm text-danger-700">
          {bulkError}
        </p>
      )}

      {data.truncated && (
        <p className="text-xs text-fg-muted">
          Showing {data.rows.filter((row) => row.status === 'error').length} of {data.counts.error} failed
          cards. Fix these to load the rest.
        </p>
      )}

      {outstanding === 0 && data.counts.skipped === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="Nothing left to fix"
              description="Every row in this import is either stocked or skipped."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.04] dark:ring-white/10 lg:grid lg:h-[calc(100vh-9rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r lg:border-border">
            <RecoveryQueueRail
              rows={visibleRows}
              groups={data.groups}
              activeGroup={activeGroup}
              onGroupChange={setActiveGroup}
              activeRowIndex={activeRowIndex}
              onSelectRow={setActiveRowIndex}
              selectedRowIndexes={selectedRowIndexes}
              onToggleSelected={toggleSelected}
            />
          </aside>

          <section className="flex min-h-[32rem] min-w-0 flex-col lg:min-h-0">
            {activeRow ? (
              <RecoveryRowPanel
                key={activeRow.rowIndex}
                slug={slug}
                importId={importId}
                row={activeRow}
                onResolved={advance}
              />
            ) : (
              <div className="grid flex-1 place-items-center p-8">
                <EmptyState title="Pick a row" description="Choose a failed card from the list." />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
