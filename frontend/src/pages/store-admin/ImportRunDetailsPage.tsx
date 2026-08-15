import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Wrench } from 'lucide-react'
import api, { cardImage } from '../../api/client'
import type { CsvImportJob, CsvImportRow } from '../../api/types'
import {
  BackButton,
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
  buttonVariants,
} from '../../components/ui'
import { ImportStat, RunStatusBadge, isActive, rowMarketPrice } from './csv-shared'
import { FailedRowsTable } from './FailedRowsTable'

const ROW_LIMIT = 100

export default function ImportRunDetailsPage() {
  const { slug = '', importId = '' } = useParams()
  const queryClient = useQueryClient()
  const [rowOffset, setRowOffset] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)

  const summaryQueryKey = ['csv-import-run', slug, importId, 'summary']
  const {
    data: summary,
    refetch: refetchSummary,
    isError: summaryRefreshFailed,
    isFetching: summaryFetching,
  } = useQuery({
    queryKey: summaryQueryKey,
    queryFn: async () => {
      const { data } = await api.get<CsvImportJob>(`/stores/${slug}/csv-imports/${importId}`, {
        params: { rowLimit: 0 },
      })
      return data
    },
    enabled: importId !== '',
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 3000 : false),
  })

  const { data: importedPage, refetch: refetchImported } = useQuery({
    queryKey: ['csv-import-run', slug, importId, 'imported', rowOffset],
    queryFn: async () => {
      const { data } = await api.get<CsvImportJob>(`/stores/${slug}/csv-imports/${importId}`, {
        params: { rowOffset, rowLimit: ROW_LIMIT, rowStatus: 'imported' },
      })
      return data
    },
    enabled: importId !== '',
    refetchInterval: () => (isActive(summary?.status) ? 3000 : false),
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
    refetchInterval: () => (isActive(summary?.status) ? 3000 : false),
  })

  const job = summary

  const actionMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'retry' | 'retry-failed' | 'cancel') => {
      setActionError(null)
      await api.post(`/stores/${slug}/csv-imports/${importId}/${action}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['csv-import-run', slug, importId] })
      await queryClient.invalidateQueries({ queryKey: ['csv-import-runs', slug] })
      await queryClient.invalidateQueries({ queryKey: ['csv-import-current', slug] })
      await refetchSummary()
      await refetchImported()
      await refetchFailed()
    },
    onError: (error: { response?: { data?: { detail?: string } }; message?: string }) => {
      const detail = error.response?.data?.detail
      if (detail) {
        setActionError(detail)
        return
      }
      setActionError(error.message === 'Network Error' ? 'Could not reach the server. Check that the API is running.' : (error.message ?? 'Import action failed'))
    },
  })

  const totalRows = job?.totalRows ?? 0
  const processedRows = job?.processedRows ?? 0
  const progress = totalRows === 0 ? 0 : Math.min(processedRows / totalRows, 1)
  const rows = importedPage?.rows ?? []
  const failedRows = failedJob?.rows ?? []
  const canPrevious = rowOffset > 0
  const canNext = rowOffset + ROW_LIMIT < (job?.importedRows ?? 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <BackButton to={`/s/${slug}/admin`}>Back to admin</BackButton>
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
                <Link
                  to={`/s/${slug}/admin/imports/${importId}/fix`}
                  className={buttonVariants({ variant: 'primary', size: 'sm' })}
                >
                  <Wrench aria-hidden className="size-4" />
                  Fix failed cards
                </Link>
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

            {summaryRefreshFailed && !summaryFetching && (
              <p role="status" className="text-sm font-medium text-danger-700">
                Could not refresh import progress. Retrying automatically…
              </p>
            )}
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
              : `Showing ${failedRows.length} failed card${failedRows.length === 1 ? '' : 's'}. Open the workspace to match them to real printings.`
          }
          actions={
            failedRows.length > 0 ? (
              <Link
                to={`/s/${slug}/admin/imports/${importId}/fix`}
                className={buttonVariants({ variant: 'primary', size: 'sm' })}
              >
                <Wrench aria-hidden className="size-4" />
                Fix failed cards
              </Link>
            ) : undefined
          }
        />
        {failedRows.length > 0 && (
          <CardBody className="p-0">
            <FailedRowsTable rows={failedRows} />
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Succeeded cards"
          subtitle={`Showing ${
            (job?.importedRows ?? 0) === 0 && rows.length === 0
              ? 0
              : rowOffset + 1
          }-${rowOffset + rows.length} of ${job?.importedRows ?? 0}`}
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

function ImportRowsTable({ rows }: { rows: CsvImportRow[] }) {
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
            </TR>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={9}>No cards to display.</EmptyRow>}
        </TBody>
      </Table>
    </div>
  )
}
