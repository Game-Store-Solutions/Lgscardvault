import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { ExternalLink } from 'lucide-react'
import {
  BackButton,
  Badge,
  buttonVariants,
  Card,
  CardHeader,
  PageHeader,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyRow,
} from '../components/ui'
import type { BadgeProps } from '../components/ui'
import { useStore } from '../hooks'
import api from '../api/client'
import type { CsvImportJobSummary, CsvImportJobStatus } from '../api/types'

function isActive(status: CsvImportJobStatus): boolean {
  return status === 'queued' || status === 'processing'
}

const STATUS_TONE: Record<CsvImportJobStatus, BadgeProps['tone']> = {
  queued: 'neutral',
  processing: 'brand',
  completed: 'success',
  failed: 'danger',
  paused: 'warning',
  cancelled: 'neutral',
}

const STATUS_LABEL: Record<CsvImportJobStatus, string> = {
  queued: 'queued',
  processing: 'processing',
  completed: 'succeeded',
  failed: 'failed',
  paused: 'paused',
  cancelled: 'cancelled',
}

function RunStatus({ status }: { status: CsvImportJobStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} className="uppercase">
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export default function PlatformStoreImportsPage() {
  const { slug = '' } = useParams()

  const { data: store } = useStore(slug)

  const { data: imports = [] } = useQuery({
    queryKey: ['platform-store-imports', slug],
    queryFn: async () => {
      const { data } = await api.get<CsvImportJobSummary[]>(`/stores/${slug}/csv-imports`)
      return data
    },
    enabled: slug !== '',
    refetchInterval: (query) =>
      query.state.data?.some((run) => isActive(run.status)) ? 5000 : false,
  })

  return (
    <div className="space-y-6">
      <BackButton to="/platform/admin">Back to platform admin</BackButton>

      <PageHeader
        title={`${store?.name ?? 'Store'} import runs`}
        subtitle={`/${store?.slug ?? slug} · Super admin audit view for CSV inventory imports.`}
        actions={
          <Link to={`/s/${slug}/admin`} className={buttonVariants({ variant: 'secondary' })}>
            <ExternalLink aria-hidden className="size-4" />
            Open store admin
          </Link>
        }
      />

      <Card>
        <CardHeader title="Import audit" subtitle={`${imports.length} runs`} />
        <Table>
          <THead>
            <TR>
              <TH>Run</TH>
              <TH>Status</TH>
              <TH>Progress</TH>
              <TH>Imported</TH>
              <TH>Failed</TH>
              <TH>Updated</TH>
              <TH className="text-right">Details</TH>
            </TR>
          </THead>
          <TBody>
            {imports.map((run) => (
              <TR key={run.id}>
                <TD>
                  <div className="font-medium text-fg">
                    #{run.id} {run.originalFilename}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                </TD>
                <TD>
                  <RunStatus status={run.status} />
                </TD>
                <TD className="text-fg-muted">
                  {run.processedRows}/{run.totalRows}
                </TD>
                <TD className="text-success-700">{run.importedRows}</TD>
                <TD className="text-danger-700">{run.failedRows}</TD>
                <TD className="text-fg-muted">{new Date(run.updatedAt).toLocaleString()}</TD>
                <TD className="text-right">
                  <Link
                    to={`/s/${slug}/admin/imports/${run.id}`}
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    View run
                  </Link>
                </TD>
              </TR>
            ))}
            {imports.length === 0 && (
              <EmptyRow colSpan={7}>No import runs for this store.</EmptyRow>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
