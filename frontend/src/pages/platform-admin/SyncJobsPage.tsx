import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '../../api/client'
import type { CatalogGame, CatalogSyncRun, ScryfallSyncResult, ScryfallSyncRun } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadingPanel,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import {
  scryfallSyncRunsKey,
  syncRunsKey,
  useCatalogSyncRuns,
  useScryfallSyncRuns,
} from '../../hooks'
import { Layers, RefreshCw, Sparkles } from 'lucide-react'

type BulkType = 'oracle_cards' | 'default_cards'

type UnifiedRun = {
  key: string
  source: 'scryfall' | 'tcgcsv'
  label: string
  status: string
  startedAt: string
  finishedAt: string | null
  result: string
}

function statusTone(status: string): 'success' | 'danger' | 'brand' | 'neutral' {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running' || status === 'queued') return 'brand'
  return 'neutral'
}

function catalogResult(run: CatalogSyncRun): string {
  if (run.status === 'failed') return run.error ?? 'Unknown error'
  if (!run.summary) return '—'
  return `${run.summary.groupsSeen ?? 0} sets · ${run.summary.cardsUpserted ?? 0} cards · ${run.summary.sealedUpserted ?? 0} sealed`
}

function scryfallResult(run: ScryfallSyncRun): string {
  if (run.status === 'failed') return run.error ?? 'Unknown error'
  if (run.status === 'queued') return 'Waiting for worker…'
  if (run.status === 'running') {
    const processed = run.summary?.processed
    return processed != null ? `${processed.toLocaleString()} processed…` : 'Downloading / upserting…'
  }
  if (!run.summary) return '—'
  const inserted = run.summary.inserted ?? 0
  const updated = run.summary.updated ?? 0
  const total = run.summary.total ?? inserted + updated
  return `${total.toLocaleString()} cards · ${inserted.toLocaleString()} new · ${updated.toLocaleString()} updated`
}

/**
 * Platform admin Sync Jobs: Scryfall MTG card bulk sync + TCGCSV per-game
 * catalog sync, with a shared run history table.
 */
export default function SyncJobsPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [queuedGame, setQueuedGame] = useState<string | null>(null)

  const gamesQuery = useQuery({
    queryKey: ['admin', 'catalog', 'games'],
    queryFn: async () => {
      const { data } = await api.get<CatalogGame[]>('/admin/catalog/games')
      return data
    },
  })
  const catalogRunsQuery = useCatalogSyncRuns()
  const scryfallRunsQuery = useScryfallSyncRuns()

  const scryfallMutation = useMutation({
    mutationFn: async (type: BulkType) => {
      const { data } = await api.post<ScryfallSyncResult>('/admin/scryfall/sync', { type })
      return data
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scryfallSyncRunsKey })
    },
    onError: (err) => setError(extractErrorMessage(err, 'Could not queue the Scryfall sync.')),
  })

  const catalogMutation = useMutation({
    mutationFn: async (code: string) => api.post(`/admin/catalog/sync/${code}`),
    onMutate: (code) => {
      setError(null)
      setQueuedGame(code)
    },
    onSuccess: () => {
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: syncRunsKey }), 1500)
    },
    onError: (err) => setError(extractErrorMessage(err, 'Could not queue the catalog sync.')),
    onSettled: () => setQueuedGame(null),
  })

  const games = gamesQuery.data ?? []
  const unifiedRuns = useMemo(() => {
    const scryfall: UnifiedRun[] = (scryfallRunsQuery.data ?? []).map((run) => ({
      key: `scryfall-${run.id}`,
      source: 'scryfall',
      label: run.label,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      result: scryfallResult(run),
    }))
    const catalog: UnifiedRun[] = (catalogRunsQuery.data ?? []).map((run) => ({
      key: `tcgcsv-${run.id}`,
      source: 'tcgcsv',
      label: run.gameName ?? run.gameCode ?? 'TCGCSV',
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      result: catalogResult(run),
    }))
    return [...scryfall, ...catalog].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
  }, [catalogRunsQuery.data, scryfallRunsQuery.data])

  const historyLoading = catalogRunsQuery.isLoading || scryfallRunsQuery.isLoading
  const refreshing = catalogRunsQuery.isFetching || scryfallRunsQuery.isFetching

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sync jobs"
        subtitle="Queue catalog refreshes. Production workers run continuously. Queue a job and watch it in the history table."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: syncRunsKey })
              void queryClient.invalidateQueries({ queryKey: scryfallSyncRunsKey })
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Refresh
          </Button>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Scryfall · Magic: The Gathering"
            subtitle="Bulk-load the local card database. Unique cards is enough for search; all printings is required for set/collector matching on imports."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SyncActionCard
                icon={Sparkles}
                title="Unique cards"
                detail="One preferred printing per card (oracle_cards). Faster."
                loading={scryfallMutation.isPending && scryfallMutation.variables === 'oracle_cards'}
                onClick={() => scryfallMutation.mutate('oracle_cards')}
                cta="Queue unique sync"
              />
              <SyncActionCard
                icon={Layers}
                title="All printings"
                detail="Every set printing (default_cards). Larger and slower; safe to re-run."
                loading={scryfallMutation.isPending && scryfallMutation.variables === 'default_cards'}
                onClick={() => scryfallMutation.mutate('default_cards')}
                cta="Queue full sync"
              />
            </div>
            {scryfallMutation.data?.status === 'queued' && (
              <p className="text-sm text-success-700">
                Queued {scryfallMutation.data.type === 'default_cards' ? 'all printings' : 'unique cards'}. Watch
                progress in Run history.
              </p>
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="TCGCSV · multi-game catalog"
            subtitle="Mirror games, sets, cards, and sealed products. TCGCSV refreshes daily; sync a game when you need a fresh pull."
          />
          <CardBody>
            {gamesQuery.isLoading ? (
              <LoadingPanel label="Loading games…" />
            ) : games.length === 0 ? (
              <EmptyState icon={RefreshCw} title="No games configured" description="Add catalog games before syncing." />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {games.map((game) => {
                  const canSync = game.tcgcsvCategoryId != null
                  const queuing = queuedGame === game.code
                  return (
                    <li key={game.code} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-fg">{game.name}</p>
                        <p className="text-xs text-fg-muted">
                          {canSync ? `TCGCSV category ${game.tcgcsvCategoryId}` : 'No TCGCSV source'}
                          {!game.active ? ' · inactive' : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canSync || queuing}
                        loading={queuing}
                        onClick={() => catalogMutation.mutate(game.code)}
                      >
                        <RefreshCw aria-hidden className="size-4" />
                        {queuing ? 'Queuing…' : 'Sync'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader title="Run history" subtitle="Scryfall and TCGCSV jobs, newest first. Active runs refresh automatically." />
        <CardBody className="p-0">
          {historyLoading ? (
            <LoadingPanel label="Loading sync runs…" />
          ) : unifiedRuns.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="No syncs yet"
              description="Queue a Scryfall or TCGCSV sync above. The run appears here immediately."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Source</TH>
                    <TH>Job</TH>
                    <TH>Status</TH>
                    <TH>Started</TH>
                    <TH>Finished</TH>
                    <TH>Result</TH>
                  </TR>
                </THead>
                <TBody>
                  {unifiedRuns.map((run) => (
                    <TR key={run.key}>
                      <TD>
                        <Badge tone={run.source === 'scryfall' ? 'brand' : 'neutral'}>
                          {run.source === 'scryfall' ? 'Scryfall' : 'TCGCSV'}
                        </Badge>
                      </TD>
                      <TD className="font-medium text-fg">{run.label}</TD>
                      <TD>
                        <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-sm text-fg-muted">{formatDateTime(run.startedAt)}</TD>
                      <TD className="whitespace-nowrap text-sm text-fg-muted">
                        {run.finishedAt ? formatDateTime(run.finishedAt) : '—'}
                      </TD>
                      <TD className="max-w-md text-sm text-fg-muted">
                        <span className="line-clamp-2">{run.result}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function SyncActionCard({
  icon: Icon,
  title,
  detail,
  cta,
  loading,
  onClick,
}: {
  icon: typeof Sparkles
  title: string
  detail: string
  cta: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-bg/60 p-4">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
        <Icon aria-hidden className="size-4" />
      </div>
      <p className="font-semibold text-fg">{title}</p>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-fg-muted">{detail}</p>
      <Button className="mt-4 w-full" size="sm" loading={loading} onClick={onClick}>
        <RefreshCw aria-hidden className="size-4" />
        {loading ? 'Queuing…' : cta}
      </Button>
    </div>
  )
}
