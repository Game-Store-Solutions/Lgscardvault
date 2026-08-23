import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import type { PrivacyRequest } from '../../api/types'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingPanel, Select, Textarea } from '../../components/ui'

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

const TYPE_LABEL: Record<string, string> = {
  do_not_sell: 'Do not sell',
  access: 'Access',
  delete: 'Delete',
  correct: 'Correct',
  takedown: 'Publisher takedown',
}

function slaLabel(row: PrivacyRequest): string {
  if (row.status === 'completed' || row.status === 'rejected') {
    return 'Closed'
  }
  if (row.overdue) {
    return 'Overdue — complete now'
  }
  const days = row.daysRemaining
  if (typeof days === 'number') {
    return days === 1 ? 'Due in 1 day' : `Due in ${days} days`
  }
  return '45-day SLA'
}

export function PrivacyRequestsPanel() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['admin-privacy-requests'],
    queryFn: async () => {
      const { data } = await api.get<PrivacyRequest[]>('/admin/privacy-requests')
      return data
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: number; status?: string; adminNotes?: string }) => {
      const { data } = await api.patch<PrivacyRequest>(`/admin/privacy-requests/${id}`, { status, adminNotes })
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-privacy-requests'] })
    },
  })

  if (query.isLoading) return <LoadingPanel />
  if (query.isError) {
    return <ErrorState title="Could not load privacy requests" description={extractErrorMessage(query.error, '')} />
  }

  const rows = [...(query.data ?? [])].sort((a, b) => Number(b.overdue) - Number(a.overdue))
  const openCount = rows.filter((row) => row.open).length
  const overdueCount = rows.filter((row) => row.overdue).length

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No privacy requests yet"
        description="CCPA / Do Not Sell and publisher takedowns from /privacy-request and /fan-content appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {openCount} open · {overdueCount} overdue (45-day SLA). Run{' '}
        <code className="rounded-btn bg-bg px-1.5 py-0.5 text-xs">php bin/console app:privacy:sla-remind</code> to
        email a digest.
      </p>
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader
            title={`#${row.id} · ${TYPE_LABEL[row.type] ?? row.type}`}
            subtitle={`${row.name} · ${row.email} · ${new Date(row.createdAt).toLocaleString()}`}
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone={row.status === 'completed' ? 'success' : row.status === 'rejected' ? 'danger' : 'brand'}>
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>
              <Badge tone={row.overdue ? 'danger' : row.open ? 'neutral' : 'success'}>{slaLabel(row)}</Badge>
              {row.californiaResident && <Badge tone="neutral">California resident</Badge>}
            </div>
            {row.details && <p className="whitespace-pre-wrap text-sm text-fg">{row.details}</p>}
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
              <Select
                label="Status"
                value={row.status}
                onChange={(e) => update.mutate({ id: row.id, status: e.target.value })}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Textarea
                label="Admin notes"
                rows={2}
                defaultValue={row.adminNotes ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (row.adminNotes ?? '')) {
                    update.mutate({ id: row.id, adminNotes: e.target.value })
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={update.isPending && update.variables?.id === row.id}
                onClick={() => update.mutate({ id: row.id, status: 'completed' })}
              >
                Mark completed
              </Button>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
