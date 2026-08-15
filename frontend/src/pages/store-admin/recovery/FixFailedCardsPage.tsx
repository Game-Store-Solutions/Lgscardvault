import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { CircleSlash } from 'lucide-react'
import { extractErrorMessage } from '../../../api/client'
import type { CsvImportRow } from '../../../api/types'
import { BackButton, Button, Card, CardBody, EmptyState, LoadingPanel } from '../../../components/ui'
import { RecoveryQueueRail } from './RecoveryQueueRail'
import { RecoveryRowPanel, type RecoveryRowPanelHandle } from './RecoveryRowPanel'
import { isTypingTarget, recoveryClusterKey } from './recoveryJob'
import { useRecoveryActions, useRecoveryQueue } from './useImportRecovery'

/**
 * Failed-card workspace: a queue on the left, one decision on the right.
 */
export default function FixFailedCardsPage() {
  const { slug = '', importId = '' } = useParams()
  const { data, isLoading, isError } = useRecoveryQueue(slug, importId)
  const { skipRow } = useRecoveryActions(slug, importId)
  const panelRef = useRef<RecoveryRowPanelHandle>(null)

  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null)
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([])
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [showKeys, setShowKeys] = useState(false)

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

  const similarRows = useMemo(() => {
    if (!activeRow || activeRow.status !== 'error') return []
    const key = recoveryClusterKey(activeRow)
    return unresolved.filter(
      (row) => row.rowIndex !== activeRow.rowIndex && recoveryClusterKey(row) === key,
    )
  }, [activeRow, unresolved])

  function advance() {
    const remaining = unresolved.filter((row) => row.rowIndex !== activeRowIndex)
    const next =
      remaining.find((row) => row.rowIndex > (activeRowIndex ?? -1)) ?? remaining[0] ?? null
    setActiveRowIndex(next?.rowIndex ?? null)
  }

  function move(delta: number) {
    if (unresolved.length === 0) return
    const index = unresolved.findIndex((row) => row.rowIndex === activeRowIndex)
    const from = index < 0 ? 0 : index
    const next = unresolved[(from + delta + unresolved.length) % unresolved.length]
    setActiveRowIndex(next.rowIndex)
  }

  function toggleSelected(rowIndex: number) {
    setSelectedRowIndexes((current) =>
      current.includes(rowIndex)
        ? current.filter((index) => index !== rowIndex)
        : [...current, rowIndex],
    )
  }

  async function skipRows(targets: CsvImportRow[]) {
    setBulkError(null)
    try {
      for (const row of targets) {
        await skipRow.mutateAsync({ rowIndex: row.rowIndex, skipped: true })
      }
      setSelectedRowIndexes([])
    } catch (error) {
      setBulkError(extractErrorMessage(error, 'Could not skip those rows.'))
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target) && event.key !== 'Enter') return

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault()
        setShowKeys((open) => !open)
        return
      }
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        move(1)
        return
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        move(-1)
        return
      }
      if (event.key === 's' || event.key === 'S') {
        if (isTypingTarget(event.target)) return
        event.preventDefault()
        panelRef.current?.skip()
        return
      }
      if (event.key === 'x' || event.key === 'X') {
        if (isTypingTarget(event.target) || activeRowIndex == null) return
        event.preventDefault()
        toggleSelected(activeRowIndex)
        return
      }
      if (event.key === 'Enter') {
        const field = event.target
        const fromQty = field instanceof HTMLInputElement && field.type === 'number'
        if (fromQty || !isTypingTarget(event.target)) {
          event.preventDefault()
          panelRef.current?.confirm()
        }
        return
      }
      if (/^[1-6]$/.test(event.key) && !isTypingTarget(event.target)) {
        event.preventDefault()
        panelRef.current?.pickResult(Number(event.key) - 1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeRowIndex, unresolved])

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
  const groupRows = unresolved.filter((row) => row.status === 'error')

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

      <p className="text-xs text-fg-muted">
        {showKeys ? (
          <>
            J/K next · Enter add · S skip · 1–6 pick printing · X select · ? hide
          </>
        ) : (
          <>
            Keyboard: J/K next · Enter add · S skip · press ? for more
          </>
        )}
      </p>

      {selectedRowIndexes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
          <p className="text-sm font-medium text-fg">{selectedRowIndexes.length} selected</p>
          <Button
            variant="secondary"
            size="sm"
            loading={skipRow.isPending}
            onClick={() =>
              void skipRows(
                allRows.filter((row) => selectedRowIndexes.includes(row.rowIndex) && row.status === 'error'),
              )
            }
          >
            <CircleSlash aria-hidden className="size-4" />
            Skip selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedRowIndexes([])}>
            Clear
          </Button>
        </div>
      )}

      {activeGroup && groupRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={skipRow.isPending}
            onClick={() => void skipRows(groupRows)}
          >
            <CircleSlash aria-hidden className="size-4" />
            Skip all {groupRows.length} in {activeGroup}
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
        <div className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.04] dark:ring-white/10 lg:grid lg:h-[calc(100vh-11rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
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
                ref={panelRef}
                slug={slug}
                importId={importId}
                row={activeRow}
                similarRows={similarRows}
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
