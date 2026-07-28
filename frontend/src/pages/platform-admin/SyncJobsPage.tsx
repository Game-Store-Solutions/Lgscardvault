import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '../../api/client'
import type { CatalogGame } from '../../api/types'
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
import { syncRunsKey, useCatalogSyncRuns } from '../../hooks'
import { RefreshCw } from 'lucide-react'

/**
 * Platform admin Sync Jobs: trigger a TCGCSV catalog sync per game and
 * watch run history (status, counters, errors). TCGCSV refreshes daily at
 * 20:00 UTC, so one sync per game per day keeps the catalog current.
 */
export default function SyncJobsPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [queuedCode, setQueuedCode] = useState<string | null>(null)

  const gamesQuery = useQuery({
    queryKey: ['admin', 'catalog', 'games'],
    queryFn: async () => {
      const { data } = await api.get<CatalogGame[]>('/admin/catalog/games')
      return data
    },
  })
  const runsQuery = useCatalogSyncRuns()

  const syncMutation = useMutation({
    mutationFn: async (code: string) => api.post(`/admin/catalog/sync/${code}`),
    onMutate: (code) => {
      setError(null)
      setQueuedCode(code)
    },
    onSuccess: () => {
      // The run row appears once the worker picks the message up.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: syncRunsKey }), 1500)
    },
    onError: (err) => setError(extractErrorMessage(err, 'Could not queue the sync.')),
    onSettled: () => setQueuedCode(null),
  })

  const games = gamesQuery.data ?? []
  const runs = runsQuery.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog sync jobs"
        subtitle="Mirror games, sets, cards, and sealed products from TCGCSV. Runs are queued on the background worker."
      />

      {error && (
        <div className="rounded-btn border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}

      <Card>
        <CardHeader title="Games" subtitle="Trigger a full catalog sync for one game." />
        <CardBody>
          {gamesQuery.isLoading ? (
            <LoadingPanel label="Loading games…" />
          ) : (
            <div className="flex flex-wrap gap-3">
              {games.map((game) => (
                <div
                  key={game.code}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-fg">{game.name}</p>
                    <p className="text-xs text-fg-muted">
                      {game.tcgcsvCategoryId != null
                        ? `TCGCSV category ${game.tcgcsvCategoryId}`
                        : 'No TCGCSV source'}
                      {!game.active && ' · inactive'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={game.tcgcsvCategoryId == null || queuedCode === game.code}
                    onClick={() => syncMutation.mutate(game.code)}
                  >
                    <RefreshCw className="size-4" />
                    {queuedCode === game.code ? 'Queuing…' : 'Sync now'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Run history" subtitle="Most recent catalog syncs, newest first." />
        <CardBody className="p-0">
          {runsQuery.isLoading ? (
            <LoadingPanel label="Loading sync runs…" />
          ) : runs.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="No syncs yet"
              description="Queue a sync above — the run appears here once the worker starts it."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Game</TH>
                  <TH>Status</TH>
                  <TH>Started</TH>
                  <TH>Finished</TH>
                  <TH>Result</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((run) => (
                  <TR key={run.id}>
                    <TD className="font-medium text-fg">{run.gameName ?? run.gameCode}</TD>
                    <TD>
                      <Badge
                        tone={run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'danger' : 'brand'}
                      >
                        {run.status}
                      </Badge>
                    </TD>
                    <TD className="text-sm text-fg-muted">{formatDateTime(run.startedAt)}</TD>
                    <TD className="text-sm text-fg-muted">{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</TD>
                    <TD className="text-sm text-fg-muted">
                      {run.status === 'failed'
                        ? (run.error ?? 'Unknown error')
                        : run.summary
                          ? `${run.summary.groupsSeen ?? 0} sets · ${run.summary.cardsUpserted ?? 0} cards · ${run.summary.sealedUpserted ?? 0} sealed`
                          : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
