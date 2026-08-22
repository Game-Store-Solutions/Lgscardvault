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

  const rows = query.data ?? []
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No privacy requests yet"
        description="CCPA / Do Not Sell submissions from /privacy-request appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
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
