import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/format'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  Tabs,
  TabPanel,
  Textarea,
} from '../../components/ui'

interface NewsletterSubscriber {
  id: number
  email: string
  source: string | null
  subscribedAt: string
  unsubscribedAt: string | null
  active: boolean
}

interface NewsletterCampaign {
  id: number
  subject: string
  preheader: string | null
  body: string
  status: 'draft' | 'sending' | 'sent' | 'failed'
  sentCount: number
  failedCount: number
  createdAt: string
  updatedAt: string | null
  sentAt: string | null
  lastError: string | null
  editable: boolean
}

interface SubscriberListResponse {
  items: NewsletterSubscriber[]
  total: number
  page: number
  limit: number
}

interface SubscriberStats {
  total: number
  active: number
  unsubscribed: number
}

const subscribersKey = ['admin-newsletter-subscribers'] as const
const campaignsKey = ['admin-newsletter-campaigns'] as const
const statsKey = ['admin-newsletter-stats'] as const

const STATUS_TONE: Record<NewsletterCampaign['status'], 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  sending: 'brand',
  sent: 'success',
  failed: 'danger',
}

function CampaignEditor({
  campaign,
  onDone,
}: {
  campaign: NewsletterCampaign | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState(campaign?.subject ?? '')
  const [preheader, setPreheader] = useState(campaign?.preheader ?? '')
  const [body, setBody] = useState(campaign?.body ?? '')
  const [testEmail, setTestEmail] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    setSubject(campaign?.subject ?? '')
    setPreheader(campaign?.preheader ?? '')
    setBody(campaign?.body ?? '')
  }, [campaign])

  useEffect(() => {
    if (!testEmail && user?.email) {
      setTestEmail(user.email)
    }
  }, [testEmail, user?.email])

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: campaignsKey })
    await queryClient.invalidateQueries({ queryKey: statsKey })
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        subject: subject.trim(),
        preheader: preheader.trim(),
        body: body.trim(),
      }
      if (campaign) {
        await api.patch(`/admin/newsletter/campaigns/${campaign.id}`, payload)
        return campaign.id
      }
      const { data } = await api.post<NewsletterCampaign>('/admin/newsletter/campaigns', payload)
      return data.id
    },
    onSuccess: async () => {
      await invalidate()
    },
  })

  const sendTest = useMutation({
    mutationFn: async (campaignId: number) => {
      await api.post(`/admin/newsletter/campaigns/${campaignId}/test`, { to: testEmail.trim() })
    },
  })

  const broadcast = useMutation({
    mutationFn: async (campaignId: number) => {
      await api.post(`/admin/newsletter/campaigns/${campaignId}/broadcast`)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (campaignId: number) => {
      await api.delete(`/admin/newsletter/campaigns/${campaignId}`)
    },
    onSuccess: async () => {
      onDone()
      await invalidate()
    },
  })

  const ready = subject.trim() !== '' && body.trim() !== ''
  const editable = campaign?.editable ?? true
  const isSending = campaign?.status === 'sending'

  const { data: liveCampaign } = useQuery({
    queryKey: [...campaignsKey, campaign?.id],
    queryFn: async () => {
      const { data } = await api.get<NewsletterCampaign>(`/admin/newsletter/campaigns/${campaign!.id}`)
      return data
    },
    enabled: Boolean(campaign?.id && isSending),
    refetchInterval: isSending ? 2000 : false,
  })

  const displayed = liveCampaign ?? campaign

  async function ensureSaved(): Promise<number | null> {
    if (!ready) return null
    if (campaign?.id && subject.trim() === campaign.subject && body.trim() === campaign.body && (preheader.trim() || null) === campaign.preheader) {
      return campaign.id
    }
    const result = await save.mutateAsync()
    return result
  }

  return (
    <Card>
      <CardHeader
        title={campaign ? `Editing “${campaign.subject}”` : 'Compose newsletter'}
        actions={
          campaign && (
            <Button variant="ghost" size="sm" onClick={onDone}>
              <X className="size-4" aria-hidden />
              Close
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        {displayed && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={STATUS_TONE[displayed.status]}>{displayed.status}</Badge>
            {displayed.status === 'sending' && (
              <span className="text-fg-muted">
                Sending… {displayed.sentCount} sent
                {displayed.failedCount > 0 ? ` · ${displayed.failedCount} failed` : ''}
              </span>
            )}
            {displayed.status === 'sent' && (
              <span className="text-fg-muted">
                Sent to {displayed.sentCount} subscriber{displayed.sentCount === 1 ? '' : 's'}
                {displayed.sentAt ? ` · ${formatDate(displayed.sentAt)}` : ''}
              </span>
            )}
            {displayed.lastError && <span className="text-danger-700">{displayed.lastError}</span>}
          </div>
        )}

        <Input
          label="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={160}
          disabled={!editable}
          placeholder="New stores on LGS Card Vault"
        />
        <Input
          label="Preheader (optional)"
          value={preheader}
          onChange={(event) => setPreheader(event.target.value)}
          maxLength={200}
          disabled={!editable}
          placeholder="Short preview line in the inbox"
        />
        <Textarea
          label="Body"
          rows={10}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={50000}
          disabled={!editable}
          placeholder="Write your update. Blank lines become new paragraphs. Every email includes an unsubscribe link."
        />

        {editable && (
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-end">
            <Input
              label="Test send to"
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              className="sm:min-w-[16rem] sm:flex-1"
            />
            <Button
              variant="secondary"
              loading={save.isPending || sendTest.isPending}
              disabled={!ready || testEmail.trim() === ''}
              onClick={async () => {
                const id = await ensureSaved()
                if (id) sendTest.mutate(id)
              }}
            >
              <Send className="size-4" aria-hidden />
              Send test
            </Button>
            <Button
              loading={save.isPending || broadcast.isPending}
              disabled={!ready}
              onClick={async () => {
                const id = await ensureSaved()
                if (!id) return
                const stats = await queryClient.fetchQuery({
                  queryKey: statsKey,
                  queryFn: async () => {
                    const { data } = await api.get<SubscriberStats>('/admin/newsletter/subscribers/stats')
                    return data
                  },
                })
                const confirmed = window.confirm(
                  `Send this newsletter to ${stats.active} active subscriber${stats.active === 1 ? '' : 's'}? This cannot be undone.`,
                )
                if (confirmed) broadcast.mutate(id)
              }}
            >
              <Mail className="size-4" aria-hidden />
              Broadcast
            </Button>
          </div>
        )}

        {(save.isError || sendTest.isError || broadcast.isError) && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(save.error ?? sendTest.error ?? broadcast.error, 'Something went wrong.')}
          </p>
        )}

        {campaign && editable && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-700 hover:text-danger-800"
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm('Delete this draft?')) remove.mutate(campaign.id)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete draft
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function SubscribersPanel() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const list = useQuery({
    queryKey: [...subscribersKey, query, page],
    queryFn: async () => {
      const { data } = await api.get<SubscriberListResponse>('/admin/newsletter/subscribers', {
        params: { q: query.trim() || undefined, page, limit: 50 },
      })
      return data
    },
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/newsletter/subscribers/${id}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: subscribersKey })
      await queryClient.invalidateQueries({ queryKey: statsKey })
    },
  })

  if (list.isLoading) return <LoadingPanel />
  if (list.isError) {
    return <ErrorState title="Could not load subscribers" description={extractErrorMessage(list.error, '')} />
  }

  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (list.data?.limit ?? 50)))

  return (
    <div className="space-y-4">
      <Input
        label="Search subscribers"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Filter by email"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No subscribers yet"
          description="Signups from the landing page will appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-bg text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Subscribed</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3 font-medium text-fg">{row.email}</td>
                  <td className="px-4 py-3 text-fg-muted">{row.source ?? '—'}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(row.subscribedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Unsubscribed'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-700 hover:text-danger-800"
                      loading={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${row.email} from the list?`)) remove.mutate(row.id)
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewsletterAdminPage() {
  const [tab, setTab] = useState<'subscribers' | 'campaigns'>('campaigns')
  const [editing, setEditing] = useState<NewsletterCampaign | null>(null)

  const stats = useQuery({
    queryKey: statsKey,
    queryFn: async () => {
      const { data } = await api.get<SubscriberStats>('/admin/newsletter/subscribers/stats')
      return data
    },
  })

  const campaigns = useQuery({
    queryKey: campaignsKey,
    queryFn: async () => {
      const { data } = await api.get<NewsletterCampaign[]>('/admin/newsletter/campaigns')
      return data
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Newsletter</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Compose updates and email everyone who subscribed on the landing page. Broadcasts run in the background
          worker — make sure <code className="rounded-btn bg-bg px-1.5 py-0.5 text-xs">messenger:consume async</code>{' '}
          is running in production.
        </p>
        {stats.data && (
          <p className="mt-2 text-sm font-medium text-fg">
            {stats.data.active} active subscriber{stats.data.active === 1 ? '' : 's'}
            {stats.data.unsubscribed > 0 ? ` · ${stats.data.unsubscribed} unsubscribed` : ''}
          </p>
        )}
      </div>

      <Tabs
        aria-label="Newsletter admin"
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'campaigns', label: 'Campaigns', icon: Mail },
          { id: 'subscribers', label: 'Subscribers', icon: Users },
        ]}
      />

      <TabPanel when="campaigns" value={tab} className="space-y-6">
        <CampaignEditor
          key={editing?.id ?? 'new'}
          campaign={editing}
          onDone={() => {
            setEditing(null)
          }}
        />

        {campaigns.isLoading ? (
          <LoadingPanel />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-fg">Past campaigns</h2>
              {!editing && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                  <Plus className="size-4" aria-hidden />
                  New campaign
                </Button>
              )}
            </div>
            {(campaigns.data ?? []).length === 0 ? (
              <EmptyState icon={Mail} title="No campaigns yet" description="Write your first newsletter above." />
            ) : (
              <ul className="space-y-2">
                {(campaigns.data ?? []).map((campaign) => (
                  <li
                    key={campaign.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg">{campaign.subject}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {formatDate(campaign.createdAt)}
                        {campaign.status === 'sent' ? ` · sent to ${campaign.sentCount}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
                      {campaign.editable && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(campaign)}>
                          <Pencil className="size-4" aria-hidden />
                          Edit
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </TabPanel>

      <TabPanel when="subscribers" value={tab}>
        <SubscribersPanel />
      </TabPanel>
    </div>
  )
}
