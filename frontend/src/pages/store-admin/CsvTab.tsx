import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { Upload } from 'lucide-react'
import api, { cardImage, extractErrorMessage } from '../../api/client'
import { inventoryKey } from '../../hooks'
import type { CsvImportJob, CsvImportJobSummary, CsvImportRow } from '../../api/types'
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
} from '../../components/ui'
import { ImportStat, RunStatusBadge, isActive, rowMarketPrice } from './csv-shared'

const REQUIRED_HEADERS = [
  'name',
  'game',
  'set',
  'condition',
  'foil',
  'rarity',
  'quantity',
  'variant',
  'collectorNumber',
]

export default function CsvTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const { data: job = null } = useQuery({
    queryKey: ['csv-import-current', slug],
    queryFn: async () => {
      const { data } = await api.get<CsvImportJob | null>(`/stores/${slug}/csv-imports/current`, {
        params: { rowLimit: 75 },
      })
      return data
    },
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 3000 : false),
  })

  const { data: importRuns = [] } = useQuery({
    queryKey: ['csv-import-runs', slug],
    queryFn: async () => {
      const { data } = await api.get<CsvImportJobSummary[]>(`/stores/${slug}/csv-imports`)
      return data
    },
    refetchInterval: (query) => (query.state.data?.some((run) => isActive(run.status)) ? 5000 : false),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      const { data } = await api.post<CsvImportJob>(`/stores/${slug}/csv-imports`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['csv-import-current', slug] })
      await queryClient.invalidateQueries({ queryKey: ['csv-import-runs', slug] })
    },
    onError: (err) => setError(extractErrorMessage(err, 'Upload failed')),
  })

  useEffect(() => {
    if (job?.status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
    }
  }, [job?.status, queryClient, slug])

  const rows = job?.rows ?? []
  const importedCount = job?.importedRows ?? 0
  const failedCount = job?.failedRows ?? 0
  const totalRows = job?.totalRows ?? 0
  const processedRows = job?.processedRows ?? 0
  const progress = totalRows === 0 ? 0 : Math.min(processedRows / totalRows, 1)
  const canUpload = !uploadMutation.isPending && !isActive(job?.status)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Import inventory from CSV"
          subtitle={
            <>
              Upload a CSV with the columns:{' '}
              <code className="rounded-btn bg-bg px-1.5 py-0.5 text-brand-600">{REQUIRED_HEADERS.join(', ')}</code>. The
              server resolves cards, prices, and inventory updates.
            </>
          }
          actions={job ? <RunStatusBadge status={job.status} /> : undefined}
        />
        <CardBody className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <ImportStat label="Rows" value={String(totalRows)} />
            <ImportStat label="Processed" value={`${processedRows}/${totalRows || 0}`} />
            <ImportStat label="Imported" value={`${importedCount}/${totalRows || 0}`} tone="success" />
            <ImportStat label="Failed" value={String(failedCount)} tone="danger" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>Server import progress</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
              />
            </div>
          </div>

          {job?.originalFilename && (
            <p className="text-sm text-fg-muted">
              File: <span className="font-medium text-fg">{job.originalFilename}</span>
            </p>
          )}

          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-btn border border-dashed border-border bg-bg px-4 py-6 text-sm font-bold text-fg-muted hover:text-fg ${
              canUpload ? '' : 'pointer-events-none opacity-50'
            }`}
          >
            <Upload className="size-4" aria-hidden />
            {uploadMutation.isPending ? 'Uploading CSV…' : 'Choose a CSV file to import'}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={!canUpload}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) uploadMutation.mutate(file)
                event.target.value = ''
              }}
              className="sr-only"
            />
          </label>

          {isActive(job?.status) && (
            <p className="text-sm text-fg-muted">
              Import is running on the server. You can leave this page and come back to this tab to see the current job
              state.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {error}
            </p>
          )}
          {job?.errorMessage && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {job.errorMessage}
            </p>
          )}
        </CardBody>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader
            title={`Import rows ${job ? `${job.rowOffset + 1}-${job.rowOffset + rows.length} of ${totalRows}` : ''}`}
            subtitle={job ? `Updated ${new Date(job.updatedAt).toLocaleTimeString()}` : undefined}
          />
          <CardBody className="p-0">
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Matched card</TH>
                    <TH>Name</TH>
                    <TH>Set</TH>
                    <TH>Collector</TH>
                    <TH>Rarity</TH>
                    <TH>Qty</TH>
                    <TH>Market price</TH>
                    <TH>Condition</TH>
                    <TH>Foil</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row, index) => (
                    <TR key={`${row.name}-${row.collectorNumber}-${index}`}>
                      <TD>
                        <MatchedCard row={row} />
                      </TD>
                      <TD>{row.name}</TD>
                      <TD className="uppercase">{row.set}</TD>
                      <TD>{row.collectorNumber}</TD>
                      <TD>{row.rarity}</TD>
                      <TD>{row.quantity}</TD>
                      <TD>{rowMarketPrice(row)}</TD>
                      <TD>{row.condition}</TD>
                      <TD>{row.isFoil ? 'Yes' : 'No'}</TD>
                      <TD>
                        <RowStatus row={row} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Import run audit"
          subtitle="Review every CSV import run, open row details, or manage active work."
        />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Run</TH>
                <TH>Status</TH>
                <TH>Progress</TH>
                <TH>Imported</TH>
                <TH>Failed</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {importRuns.map((run) => (
                <TR
                  key={run.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/s/${slug}/admin/imports/${run.id}`)}
                >
                  <TD>
                    <Link
                      to={`/s/${slug}/admin/imports/${run.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block font-bold text-brand-600 hover:text-brand-700"
                    >
                      #{run.id} {run.originalFilename}
                    </Link>
                    <span className="text-xs text-fg-muted">{new Date(run.createdAt).toLocaleString()}</span>
                  </TD>
                  <TD>
                    <RunStatusBadge status={run.status} />
                  </TD>
                  <TD>
                    {run.processedRows}/{run.totalRows}
                  </TD>
                  <TD className="text-success-700">{run.importedRows}</TD>
                  <TD className="text-danger-700">{run.failedRows}</TD>
                  <TD className="text-fg-muted">{new Date(run.updatedAt).toLocaleTimeString()}</TD>
                </TR>
              ))}
              {importRuns.length === 0 && <EmptyRow colSpan={6}>No import runs yet.</EmptyRow>}
            </TBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  )
}

function MatchedCard({ row }: { row: CsvImportRow }) {
  if (!row.card) return <span className="text-fg-muted">Pending match</span>
  return (
    <div className="flex min-w-56 items-center gap-3">
      {cardImage(row.card) && <img src={cardImage(row.card)} alt={row.card.name} className="h-14 rounded-btn" />}
      <div>
        <div className="font-bold text-fg">{row.card.name}</div>
        <div className="text-xs text-fg-muted">
          {(row.card.setCode ?? '-').toUpperCase()} #{row.card.collectorNumber ?? '-'}
        </div>
      </div>
    </div>
  )
}

function RowStatus({ row }: { row: CsvImportRow }) {
  if (row.status === 'imported') {
    return (
      <Badge tone="success">
        Added {row.card?.setCode?.toUpperCase()} #{row.card?.collectorNumber}
      </Badge>
    )
  }
  if (row.status === 'error') {
    return (
      <span title={row.error ?? undefined}>
        <Badge tone="danger">{row.error ?? 'Import failed'}</Badge>
      </span>
    )
  }
  if (row.status === 'processing') {
    return <Badge tone="brand">Resolving…</Badge>
  }
  return <Badge tone="neutral">Queued</Badge>
}

