import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
import api, { cardImage, formatScryfallPrice } from '../../api/client'
import { inventoryKey } from '../../hooks'
import type { CardSummary, CsvImportJob, CsvImportRow } from '../../api/types'
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyRow,
  Badge,
  Button,
  Input,
  Modal,
} from '../../components/ui'
import { ImportStat, RunStatusBadge, isActive, rowMarketPrice } from './csv-shared'

const ROW_LIMIT = 100

interface BatchRecoveryResult {
  row: CsvImportRow
  card?: CardSummary | null
  error?: string | null
}

function hasResolvedCard(result: BatchRecoveryResult): result is BatchRecoveryResult & { card: CardSummary } {
  return result.card != null
}

export default function ImportRunDetailsPage() {
  const { slug = '', importId = '' } = useParams()
  const queryClient = useQueryClient()
  const [rowOffset, setRowOffset] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [recoveringRow, setRecoveringRow] = useState<CsvImportRow | null>(null)
  const [batchRecoveryResults, setBatchRecoveryResults] = useState<BatchRecoveryResult[] | null>(null)

  const queryKey = ['csv-import-run', slug, importId, 'imported', rowOffset]
  const { data: job, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<CsvImportJob>(`/stores/${slug}/csv-imports/${importId}`, {
        params: { rowOffset, rowLimit: ROW_LIMIT, rowStatus: 'imported' },
      })
      return data
    },
    enabled: importId !== '',
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 3000 : false),
  })

  const { data: failedJob, refetch: refetchFailed } = useQuery({
    queryKey: ['csv-import-run', slug, importId, 'failed'],
    queryFn: async () => {
      const { data } = await api.get<CsvImportJob>(`/stores/${slug}/csv-imports/${importId}`, {
        params: { rowOffset: 0, rowLimit: 250, rowStatus: 'error' },
      })
      return data
    },
    enabled: importId !== '',
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 3000 : false),
  })

  const actionMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'retry' | 'retry-failed' | 'cancel') => {
      setActionError(null)
      await api.post(`/stores/${slug}/csv-imports/${importId}/${action}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['csv-import-run', slug, importId] })
      await queryClient.invalidateQueries({ queryKey: ['csv-import-runs', slug] })
      await queryClient.invalidateQueries({ queryKey: ['csv-import-current', slug] })
      await refetch()
      await refetchFailed()
    },
    onError: (error: { response?: { data?: { detail?: string } }; message?: string }) => {
      setActionError(error.response?.data?.detail ?? error.message ?? 'Import action failed')
    },
  })

  const previewFailedMutation = useMutation({
    mutationFn: async () => {
      setActionError(null)
      const { data } = await api.post<{ results: BatchRecoveryResult[] }>(
        `/stores/${slug}/csv-imports/${importId}/failed/preview`,
      )
      return data.results
    },
    onSuccess: (results) => {
      setBatchRecoveryResults(results)
    },
    onError: (error: { response?: { data?: { detail?: string } }; message?: string }) => {
      setActionError(error.response?.data?.detail ?? error.message ?? 'Could not resolve failed cards.')
    },
  })

  async function refreshImportRun() {
    await queryClient.invalidateQueries({ queryKey: ['csv-import-run', slug, importId] })
    await queryClient.invalidateQueries({ queryKey: ['csv-import-runs', slug] })
    await queryClient.invalidateQueries({ queryKey: ['csv-import-current', slug] })
    await queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
    await refetch()
    await refetchFailed()
  }

  const totalRows = job?.totalRows ?? 0
  const processedRows = job?.processedRows ?? 0
  const progress = totalRows === 0 ? 0 : Math.min(processedRows / totalRows, 1)
  const rows = job?.rows ?? []
  const failedRows = failedJob?.rows ?? []
  const canPrevious = rowOffset > 0
  const canNext = rowOffset + ROW_LIMIT < (job?.importedRows ?? 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <Link
              to={`/s/${slug}/admin`}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to admin
            </Link>
            <h1 className="mt-2 font-display text-2xl font-bold text-fg">Import run #{job?.id ?? importId}</h1>
            <p className="mt-1 text-sm text-fg-muted">{job?.originalFilename ?? 'Loading import run...'}</p>
          </div>
          {job && <RunStatusBadge status={job.status} />}
        </CardHeader>

        {job && (
          <CardBody className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <ImportStat label="Rows" value={String(job.totalRows)} />
              <ImportStat label="Processed" value={`${job.processedRows}/${job.totalRows}`} />
              <ImportStat label="Imported" value={String(job.importedRows)} tone="success" />
              <ImportStat label="Failed" value={String(job.failedRows)} tone="danger" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-fg-muted">
                <span>Progress</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(job.status === 'queued' || job.status === 'processing') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => actionMutation.mutate('pause')}
                  loading={actionMutation.isPending}
                >
                  Pause
                </Button>
              )}
              {job.status === 'paused' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => actionMutation.mutate('resume')}
                  loading={actionMutation.isPending}
                >
                  Resume
                </Button>
              )}
              {job.status === 'failed' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => actionMutation.mutate('retry')}
                  loading={actionMutation.isPending}
                >
                  Retry
                </Button>
              )}
              {job.failedRows > 0 && !isActive(job.status) && job.status !== 'cancelled' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => previewFailedMutation.mutate()}
                  loading={previewFailedMutation.isPending}
                >
                  Retry failed cards
                </Button>
              )}
              {!['completed', 'failed', 'cancelled'].includes(job.status) && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => actionMutation.mutate('cancel')}
                  loading={actionMutation.isPending}
                >
                  Cancel
                </Button>
              )}
            </div>

            {actionError && (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {actionError}
              </p>
            )}
            {job.errorMessage && (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {job.errorMessage}
              </p>
            )}
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Failed cards"
          subtitle={
            failedRows.length === 0
              ? 'No failed cards in this run.'
              : `Showing ${failedRows.length} failed card${failedRows.length === 1 ? '' : 's'}.`
          }
        />
        {failedRows.length > 0 && (
          <CardBody className="p-0">
            <ImportRowsTable rows={failedRows} onRecover={setRecoveringRow} />
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Succeeded cards"
          subtitle={`Showing ${job?.importedRows === 0 ? 0 : rowOffset + 1}-${rowOffset + rows.length} of ${
            job?.importedRows ?? 0
          }`}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canPrevious}
                onClick={() => setRowOffset(Math.max(0, rowOffset - ROW_LIMIT))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canNext}
                onClick={() => setRowOffset(rowOffset + ROW_LIMIT)}
              >
                Next
              </Button>
            </div>
          }
        />
        <CardBody className="p-0">
          <ImportRowsTable rows={rows} />
        </CardBody>
      </Card>

      <ManualImportModal
        slug={slug}
        importId={importId}
        gameCode={job?.gameCode ?? 'mtg'}
        row={recoveringRow}
        onClose={() => setRecoveringRow(null)}
        onResolved={async () => {
          setRecoveringRow(null)
          await refreshImportRun()
        }}
      />

      <BatchRecoveryModal
        slug={slug}
        importId={importId}
        results={batchRecoveryResults}
        onClose={() => setBatchRecoveryResults(null)}
        onResolved={async () => {
          setBatchRecoveryResults(null)
          await refreshImportRun()
        }}
      />
    </div>
  )
}

function RowStatus({ row }: { row: CsvImportRow }) {
  if (row.status === 'imported') return <Badge tone="success">Imported</Badge>
  if (row.status === 'error') {
    return (
      <span title={row.error ?? undefined}>
        <Badge tone="danger">{row.error ?? 'Failed'}</Badge>
      </span>
    )
  }
  if (row.status === 'processing') return <Badge tone="brand">Processing</Badge>
  return <Badge tone="neutral">Queued</Badge>
}

function ImportRowsTable({ rows, onRecover }: { rows: CsvImportRow[]; onRecover?: (row: CsvImportRow) => void }) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Matched card</TH>
            <TH>Name</TH>
            <TH>Set</TH>
            <TH>Collector</TH>
            <TH>Qty</TH>
            <TH>Market price</TH>
            <TH>Condition</TH>
            <TH>Foil</TH>
            <TH>Status</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.rowIndex}>
              <TD>
                {row.card ? (
                  <div className="flex min-w-56 items-center gap-3">
                    {cardImage(row.card) && (
                      <img src={cardImage(row.card)} alt={row.card.name} className="h-14 rounded-btn" />
                    )}
                    <div>
                      <div className="font-bold text-fg">{row.card.name}</div>
                      <div className="text-xs text-fg-muted">
                        {(row.card.setCode ?? '-').toUpperCase()} #{row.card.collectorNumber ?? '-'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-fg-muted">Pending match</span>
                )}
              </TD>
              <TD>{row.name}</TD>
              <TD className="uppercase">{row.set}</TD>
              <TD>{row.collectorNumber}</TD>
              <TD>{row.quantity}</TD>
              <TD>{rowMarketPrice(row)}</TD>
              <TD>{row.condition}</TD>
              <TD>{row.isFoil ? 'Yes' : 'No'}</TD>
              <TD>
                <RowStatus row={row} />
              </TD>
              <TD>
                {row.status === 'error' && onRecover ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onRecover(row)}
                    title="Search Scryfall and add this failed row to inventory"
                  >
                    <Search aria-hidden className="size-4" />
                    Resolve
                  </Button>
                ) : (
                  <span className="text-fg-muted">-</span>
                )}
              </TD>
            </TR>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={10}>No cards to display.</EmptyRow>}
        </TBody>
      </Table>
    </div>
  )
}

function scryfallSearchTerm(row: CsvImportRow): string {
  return row.name.trim()
}

function ManualImportModal({
  slug,
  importId,
  gameCode,
  row,
  onClose,
  onResolved,
}: {
  slug: string
  importId: string
  /** The import's game — recovery may only pick cards from its catalog. */
  gameCode: string
  row: CsvImportRow | null
  onClose: () => void
  onResolved: () => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (row) {
      setSearch(scryfallSearchTerm(row))
      setError(null)
    }
  }, [row])

  const { data: results = [], isFetching, refetch } = useQuery({
    queryKey: ['csv-row-manual-card-search', row?.rowIndex, search, gameCode],
    enabled: Boolean(row),
    queryFn: async () => {
      if (!row || !search.trim()) return []
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: search,
          // Scoped to the import's game — suggesting Magic printings for a
          // Pokemon row is how game-less listings used to get created.
          game: gameCode,
          ...(row.set.trim() ? { set: row.set.trim() } : {}),
          ...(row.collectorNumber.trim() ? { collectorNumber: row.collectorNumber.trim() } : {}),
          ...(row.rarity.trim() ? { rarity: row.rarity.trim() } : {}),
          finish: row.isFoil ? 'foil' : 'nonfoil',
        },
      })
      return data
    },
  })

  const importMutation = useMutation({
    mutationFn: async (card: CardSummary) => {
      if (!row) return
      await api.post(`/stores/${slug}/csv-imports/${importId}/rows/${row.rowIndex}/manual-import`, {
        cardId: card.id,
        quantity: row.quantity,
        condition: row.condition,
        isFoil: row.isFoil,
      })
    },
    onMutate: () => setError(null),
    onSuccess: onResolved,
    onError: (err: { response?: { data?: { detail?: string } }; message?: string }) => {
      setError(err.response?.data?.detail ?? err.message ?? 'Could not add this row to inventory.')
    },
  })

  if (!row) return null

  return (
    <Modal open onClose={onClose} title={`Resolve row ${row.rowIndex + 1}`} className="max-w-5xl">
      <div className="space-y-5">
        <div className="rounded-card border border-border bg-bg p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <Fact label="Name" value={row.name} />
            <Fact label="Set" value={row.set || '-'} />
            <Fact label="Collector" value={row.collectorNumber || '-'} />
            <Fact label="Qty" value={String(row.quantity)} />
          </div>
          {row.error && <p className="mt-3 text-sm font-medium text-danger-700">{row.error}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Input
            label="Card search (catalog · Scryfall · MTGJSON)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void refetch()}
          />
          <Button variant="secondary" onClick={() => void refetch()} loading={isFetching}>
            <Search aria-hidden className="size-4" />
            Search
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {error}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {results.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => importMutation.mutate(card)}
              disabled={importMutation.isPending}
              className="flex min-h-32 items-start gap-3 rounded-card border border-border bg-surface p-3 text-left transition-colors hover:border-brand-300 disabled:cursor-wait disabled:opacity-60"
            >
              {cardImage(card) && <img src={cardImage(card)} alt={card.name} className="h-28 rounded-btn" />}
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold leading-snug text-fg">{card.name}</span>
                <span className="mt-0.5 block text-xs uppercase tracking-wide text-fg-muted">
                  {card.setCode?.toUpperCase() ?? '-'} - #{card.collectorNumber ?? '-'}
                </span>
                {card.setName && <span className="mt-1 block text-xs text-fg-muted">{card.setName}</span>}
                <span className="mt-2 block text-sm font-bold text-brand-600">
                  {formatScryfallPrice(card, row.isFoil ? 'foil' : 'nonfoil')}
                </span>
                <span className="mt-2 inline-flex">
                  <Badge tone="brand">Add to inventory</Badge>
                </span>
              </span>
            </button>
          ))}
        </div>

        {!isFetching && results.length === 0 && (
          <p className="text-sm text-fg-muted">
            No matches found in the catalog, Scryfall, or MTGJSON. Try loosening the search — the set and printing
            filters from the row still apply.
          </p>
        )}
      </div>
    </Modal>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="font-bold text-fg">{value}</p>
    </div>
  )
}

function BatchRecoveryModal({
  slug,
  importId,
  results,
  onClose,
  onResolved,
}: {
  slug: string
  importId: string
  results: BatchRecoveryResult[] | null
  onClose: () => void
  onResolved: () => Promise<void>
}) {
  const safeResults = results ?? []
  const resolved = safeResults.filter(hasResolvedCard)
  const unresolvedCount = safeResults.length - resolved.length
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (results) setError(null)
  }, [results])

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/csv-imports/${importId}/failed/manual-import`, {
        items: resolved.map((result) => ({
          rowIndex: result.row.rowIndex,
          cardId: result.card.id,
        })),
      })
    },
    onMutate: () => setError(null),
    onSuccess: onResolved,
    onError: (err: { response?: { data?: { detail?: string } }; message?: string }) => {
      setError(err.response?.data?.detail ?? err.message ?? 'Could not finalize failed card recovery.')
    },
  })

  if (!results) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Review failed card matches"
      className="max-w-[calc(100vw-2rem)] 2xl:max-w-[92rem]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={finalizeMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={finalizeMutation.isPending}
            disabled={resolved.length === 0}
            onClick={() => finalizeMutation.mutate()}
          >
            {unresolvedCount === 0 ? 'Finalize all cards' : `Finalize ${resolved.length} matched cards`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ImportStat label="Matched" value={String(resolved.length)} tone="success" />
          <ImportStat label="Needs review" value={String(unresolvedCount)} tone={unresolvedCount > 0 ? 'danger' : 'neutral'} />
          <ImportStat label="Total" value={String(safeResults.length)} />
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {error}
          </p>
        )}

        <div className="max-h-[60vh] overflow-auto rounded-card border border-border">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>CSV row</TH>
                <TH>Matched card</TH>
                <TH>Set</TH>
                <TH>Collector</TH>
                <TH>Qty</TH>
                <TH>Finish</TH>
                <TH>Market price</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {safeResults.map((result) => (
                <TR key={result.row.rowIndex}>
                  <TD>
                    <div className="min-w-48">
                      <div className="font-bold text-fg">{result.row.name}</div>
                      <div className="text-xs text-fg-muted">Row {result.row.rowIndex + 1}</div>
                    </div>
                  </TD>
                  <TD>
                    {result.card ? (
                      <div className="flex min-w-64 items-center gap-3">
                        {cardImage(result.card) && (
                          <img src={cardImage(result.card)} alt={result.card.name} className="h-16 rounded-btn" />
                        )}
                        <div>
                          <div className="font-bold text-fg">{result.card.name}</div>
                          {result.card.setName && <div className="text-xs text-fg-muted">{result.card.setName}</div>}
                        </div>
                      </div>
                    ) : (
                      <span className="text-fg-muted">{result.error ?? 'No match found'}</span>
                    )}
                  </TD>
                  <TD className="uppercase">{result.card?.setCode ?? result.row.set}</TD>
                  <TD>{result.card?.collectorNumber ?? result.row.collectorNumber}</TD>
                  <TD>{result.row.quantity}</TD>
                  <TD>{result.row.finish}</TD>
                  <TD>{result.card ? formatScryfallPrice(result.card, result.row.isFoil ? 'foil' : 'nonfoil') : '-'}</TD>
                  <TD>
                    {result.card ? <Badge tone="success">Ready</Badge> : <Badge tone="danger">Needs review</Badge>}
                  </TD>
                </TR>
              ))}
              {safeResults.length === 0 && <EmptyRow colSpan={8}>No failed cards to resolve.</EmptyRow>}
            </TBody>
          </Table>
        </div>
      </div>
    </Modal>
  )
}

