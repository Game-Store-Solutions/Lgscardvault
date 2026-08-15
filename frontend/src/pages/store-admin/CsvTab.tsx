import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import api, { cardImage } from '../../api/client'
import { sealedInventoryKey } from '../../hooks'
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
import ImportWizard from './ImportWizard'
import { CardImage } from '../../components/cards'

export default function CsvTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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

  const refreshImports = () => {
    void queryClient.invalidateQueries({ queryKey: ['csv-import-current', slug] })
    void queryClient.invalidateQueries({ queryKey: ['csv-import-runs', slug] })
  }

  useEffect(() => {
    if (!job) return
    // Refresh inventory as rows land — not only when the whole job finishes —
    // so admin + storefront catch up while the worker is still running.
    if (isActive(job.status) || job.status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['inventory', slug] })
      void queryClient.invalidateQueries({ queryKey: sealedInventoryKey(slug) })
    }
  }, [job?.status, job?.importedRows, queryClient, slug])

  const rows = job?.rows ?? []
  const queuedRows = job?.queuedRows ?? 0
  const processingRows = job?.processingRows ?? 0
  const importedCount = job?.importedRows ?? 0
  const failedCount = job?.failedRows ?? 0
  const totalRows = job?.totalRows ?? 0
  const processedRows = job?.processedRows ?? 0
  const progress = totalRows === 0 ? 0 : Math.min(processedRows / totalRows, 1)
  const sealedJob = job?.importType === 'sealed'

  return (
    <div className="space-y-6">
      <ImportWizard slug={slug} busy={isActive(job?.status)} onImported={refreshImports} />

      {job && (
        <Card>
          <CardHeader
            title="Latest import"
            subtitle={
              <>
                {job.originalFilename} · {job.gameCode?.toUpperCase() ?? 'MTG'} ·{' '}
                {sealedJob ? 'sealed products' : 'singles'}
              </>
            }
            actions={<RunStatusBadge status={job.status} />}
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

            {isActive(job.status) && (
              <p className="text-sm text-fg-muted">
                Import is running on the server. You can leave this page and come back to this tab to see the current
                job state.
                {queuedRows > 0 && processingRows === 0 && (
                  <>
                    {' '}
                    <span className="font-medium text-fg">
                      {queuedRows} row{queuedRows === 1 ? '' : 's'} waiting in the queue
                    </span>
                    — batches of ~40 cards resolve against Scryfall, so large files take a few minutes. If nothing
                    changes for over a minute, the background worker may be stuck — refresh this page or retry the
                    import; production workers run continuously and do not need to be started by hand.
                  </>
                )}
                {processingRows > 0 && (
                  <>
                    {' '}
                    <span className="font-medium text-brand-600">
                      Resolving {processingRows} row{processingRows === 1 ? '' : 's'}…
                    </span>
                  </>
                )}
              </p>
            )}
            {job.errorMessage && (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {job.errorMessage}
              </p>
            )}

            {failedCount > 0 && !isActive(job.status) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-200 bg-danger-50 px-4 py-3">
                <p className="text-sm text-danger-800">
                  <span className="font-bold">{failedCount}</span> failed card
                  {failedCount === 1 ? '' : 's'} — match them to real printings, or skip the ones that cannot be fixed.
                </p>
                <Link
                  to={`/s/${slug}/admin/imports/${job.id}/fix`}
                  className="inline-flex items-center rounded-btn bg-brand-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-600"
                >
                  Fix failed cards
                </Link>
              </div>
            )}
          </CardBody>
        </Card>
      )}

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
                    <TH>{sealedJob ? 'Matched product' : 'Matched card'}</TH>
                    <TH>Name</TH>
                    <TH>Set</TH>
                    {!sealedJob && <TH>Collector</TH>}
                    {!sealedJob && <TH>Rarity</TH>}
                    <TH>Qty</TH>
                    {!sealedJob && <TH>Market price</TH>}
                    {!sealedJob && <TH>Condition</TH>}
                    {!sealedJob && <TH>Foil</TH>}
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row, index) => (
                    <TR key={`${row.name}-${row.collectorNumber}-${index}`}>
                      <TD>
                        <MatchedCard row={row} sealed={sealedJob} />
                      </TD>
                      <TD>{row.name}</TD>
                      <TD className={sealedJob ? undefined : 'uppercase'}>{row.set}</TD>
                      {!sealedJob && <TD>{row.collectorNumber}</TD>}
                      {!sealedJob && <TD>{row.rarity}</TD>}
                      <TD>{row.quantity}</TD>
                      {!sealedJob && <TD>{rowMarketPrice(row)}</TD>}
                      {!sealedJob && <TD>{row.condition}</TD>}
                      {!sealedJob && <TD>{row.isFoil ? 'Yes' : 'No'}</TD>}
                      <TD>
                        <RowStatus row={row} sealed={sealedJob} />
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
                <TH>Game</TH>
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
                  <TD className="text-sm text-fg-muted">
                    {(run.gameCode ?? 'mtg').toUpperCase()} · {run.importType === 'sealed' ? 'Sealed' : 'Singles'}
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
              {importRuns.length === 0 && <EmptyRow colSpan={7}>No import runs yet.</EmptyRow>}
            </TBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  )
}

function MatchedCard({ row, sealed }: { row: CsvImportRow; sealed: boolean }) {
  if (!row.card) return <span className="text-fg-muted">Pending match</span>

  // Sealed rows carry a product payload (name/setName/imageUrl) instead of a
  // card printing, so they have no set code or collector number to show.
  const image = sealed ? row.card.imageUrl : cardImage(row.card)
  return (
    <div className="flex min-w-56 items-center gap-3">
      <CardImage src={image} alt={row.card.name} fit="contain" showLabel={false} className="h-14 w-10 rounded-btn" />
      <div>
        <div className="font-bold text-fg">{row.card.name}</div>
        <div className="text-xs text-fg-muted">
          {sealed
            ? (row.card.setName ?? 'Sealed product')
            : `${(row.card.setCode ?? '-').toUpperCase()} #${row.card.collectorNumber ?? '-'}`}
        </div>
      </div>
    </div>
  )
}

function RowStatus({ row, sealed }: { row: CsvImportRow; sealed: boolean }) {
  if (row.status === 'imported') {
    return (
      <Badge tone="success">
        {sealed ? 'Stocked' : `Added ${row.card?.setCode?.toUpperCase()} #${row.card?.collectorNumber}`}
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

