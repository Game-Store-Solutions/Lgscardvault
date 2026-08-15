import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { CircleSlash } from 'lucide-react'
import { extractErrorMessage } from '../../../api/client'
import type { CsvImportRow } from '../../../api/types'
import {
  BackButton,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadingPanel,
} from '../../../components/ui'
import { ImportStat } from '../csv-shared'
import { RecoveryQueueRail } from './RecoveryQueueRail'
import { RecoveryRowPanel } from './RecoveryRowPanel'
import { useRecoveryActions, useRecoveryQueue } from './useImportRecovery'

/**
 * The failed-card workspace.
 *
 * This replaces the old pair of modals. Recovery is a queue of similar
 * decisions, not a series of dialogs: keeping the list on screen next to the
 * card being resolved means the operator never loses their place, and
 * finishing a row advances to the next one automatically.
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

  // Rows in the chosen bucket. A skipped row stays visible so it can be
  // restored, but it never counts as outstanding work.
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

  // Keep a row selected at all times so the panel is never blank.
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

  /** Move to the next row that still needs attention. */
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
      // Sequential on purpose: each skip re-syncs the job counters, and firing
      // them in parallel makes those writes race.
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
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <BackButton to={`/s/${slug}/admin/imports/${importId}`}>Back to import run</BackButton>
            <h1 className="mt-2 font-display text-2xl font-bold text-fg">Fix failed cards</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Import #{importId} — resolve each row onto a real printing, or skip it.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <ImportStat label="Needs attention" value={String(outstanding)} tone="danger" />
            <ImportStat label="Added" value={String(data.counts.imported)} tone="success" />
            <ImportStat label="Skipped" value={String(data.counts.skipped)} />
            <ImportStat label="Selected" value={String(selectedRowIndexes.length)} />
          </div>

          {selectedRowIndexes.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg p-3">
              <p className="text-sm font-bold text-fg">
                {selectedRowIndexes.length} row{selectedRowIndexes.length === 1 ? '' : 's'} selected
              </p>
              <Button variant="secondary" size="sm" loading={skipRow.isPending} onClick={() => void skipSelected()}>
                <CircleSlash aria-hidden className="size-4" />
                Skip selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRowIndexes([])}>
                Clear selection
              </Button>
            </div>
          )}

          {bulkError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {bulkError}
            </p>
          )}
        </CardBody>
      </Card>

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
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
            <CardBody className="flex max-h-[32rem] flex-col p-0 lg:max-h-[calc(100vh-6rem)]">
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
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              {activeRow ? (
                <RecoveryRowPanel
                  key={activeRow.rowIndex}
                  slug={slug}
                  importId={importId}
                  row={activeRow}
                  onResolved={advance}
                />
              ) : (
                <EmptyState
                  title="Pick a row"
                  description="Choose a failed card from the list to resolve it."
                />
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
