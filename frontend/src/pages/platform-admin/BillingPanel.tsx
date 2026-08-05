import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingUp, Wallet } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type {
  AdminBilling,
  AdminBillingRetryResult,
  AdminSubscription,
  AdminSubscriptionCharge,
} from '../../api/types'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingPanel, Table, TBody, TD, TH, THead, TR } from '../../components/ui'

const billingKey = ['admin-billing'] as const

/** Only these two need an operator to do something, so only these are loud. */
const NEEDS_ATTENTION = new Set(['past_due', 'suspended'])

export function BillingPanel() {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const [retryingSlug, setRetryingSlug] = useState<string | null>(null)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: billingKey,
    queryFn: async () => {
      const { data } = await api.get<AdminBilling>('/admin/billing')
      return data
    },
  })

  const retry = useMutation({
    mutationFn: async (slug: string) => {
      const { data } = await api.post<AdminBillingRetryResult>(`/admin/billing/${slug}/retry`)
      return data
    },
    onSettled: async () => {
      setRetryingSlug(null)
      await queryClient.invalidateQueries({ queryKey: billingKey })
    },
  })

  // Anything needing attention floats to the top; the rest stays in due-date
  // order so the table reads as "act on this, then here is what is coming".
  // Depend on `data` (stable from the query) rather than a fresh `?? []`
  // array that would change identity every render.
  const ordered = useMemo(() => {
    const subscriptions = data?.subscriptions ?? []
    const attention = subscriptions.filter((s) => NEEDS_ATTENTION.has(s.subscriptionStatus) || s.isOverdue)
    const healthy = subscriptions.filter((s) => !attention.includes(s))
    return [...attention, ...(showAll ? healthy : healthy.slice(0, 8))]
  }, [data, showAll])

  const hiddenCount = (data?.subscriptions.length ?? 0) - ordered.length

  if (isLoading) return <LoadingPanel label="Loading subscription billing..." />

  if (isError || !data) {
    return (
      <div className="rounded-card border border-border bg-surface">
        <ErrorState title="Could not load billing" description="Subscription billing could not be loaded." onRetry={() => void refetch()} />
      </div>
    )
  }

  const { summary, subscriptions } = data
  const retryError = extractErrorMessage(retry.error, '')

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BillingStat
          icon={<TrendingUp aria-hidden className="size-5" />}
          label="Monthly recurring"
          value={formatPrice(summary.mrrCents)}
          detail={`${summary.activeCount} active ${summary.activeCount === 1 ? 'subscription' : 'subscriptions'}`}
        />
        <BillingStat
          icon={<Wallet aria-hidden className="size-5" />}
          label="Collected this month"
          value={formatPrice(summary.collectedThisMonthCents)}
          detail="Successful charges since the 1st"
        />
        <BillingStat
          icon={<AlertTriangle aria-hidden className="size-5" />}
          label="Overdue"
          value={formatPrice(summary.overdueCents)}
          detail={`${summary.pastDueCount} past due · ${summary.suspendedCount} suspended`}
          tone={summary.overdueCents > 0 ? 'danger' : 'neutral'}
        />
        <BillingStat
          icon={<CheckCircle2 aria-hidden className="size-5" />}
          label="Awaiting collection"
          value={String(summary.dueCount)}
          detail={summary.dueCount > 0 ? 'Charged on the next nightly run' : 'Everything is current'}
          tone={summary.dueCount > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <Card>
        <CardHeader
          title="Subscriptions"
          subtitle="What each store pays the marketplace, and when it is next collected."
          actions={
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>
              <RefreshCw aria-hidden className="size-4" />
              Refresh
            </Button>
          }
        />
        {retryError && (
          <CardBody>
            <p role="alert" className="text-sm text-danger-700">{retryError}</p>
          </CardBody>
        )}
        {subscriptions.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No paid subscriptions yet"
              description="Stores on the free tier are not billed, so they do not appear here."
            />
          </CardBody>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Store</TH>
                  <TH>Plan</TH>
                  <TH>Status</TH>
                  <TH>Next bill</TH>
                  <TH>Last charged</TH>
                  <TH>Method</TH>
                  <TH>&nbsp;</TH>
                </TR>
              </THead>
              <TBody>
                {ordered.map((sub) => (
                  <SubscriptionRow
                    key={sub.slug}
                    sub={sub}
                    busy={retry.isPending && retryingSlug === sub.slug}
                    onRetry={() => {
                      setRetryingSlug(sub.slug)
                      retry.mutate(sub.slug)
                    }}
                  />
                ))}
              </TBody>
            </Table>
            {hiddenCount > 0 && (
              <CardBody>
                <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                  Show {hiddenCount} more {hiddenCount === 1 ? 'subscription' : 'subscriptions'}
                </Button>
              </CardBody>
            )}
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By month" subtitle="Collected and failed subscription charges." />
          {data.months.length === 0 ? (
            <CardBody>
              <p className="text-sm text-fg-muted">No charges recorded yet.</p>
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH>Collected</TH>
                  <TH>Charges</TH>
                  <TH>Failed</TH>
                </TR>
              </THead>
              <TBody>
                {data.months.map((month) => (
                  <TR key={month.month}>
                    <TD className="font-medium">{formatMonth(month.month)}</TD>
                    <TD>{formatPrice(month.paidCents)}</TD>
                    <TD className="text-fg-muted">{month.paidCount}</TD>
                    <TD>
                      {month.failedCount > 0 ? (
                        <Badge tone="danger">{month.failedCount}</Badge>
                      ) : (
                        <span className="text-fg-muted">0</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent charges" subtitle="Most recent collection attempts across all stores." />
          {data.recentCharges.length === 0 ? (
            <CardBody>
              <p className="text-sm text-fg-muted">No charges recorded yet.</p>
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Store</TH>
                  <TH>Amount</TH>
                  <TH>Result</TH>
                </TR>
              </THead>
              <TBody>
                {data.recentCharges.map((charge) => (
                  <ChargeRow key={charge.id} charge={charge} />
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  )
}

function SubscriptionRow({ sub, busy, onRetry }: { sub: AdminSubscription; busy: boolean; onRetry: () => void }) {
  const needsAttention = NEEDS_ATTENTION.has(sub.subscriptionStatus)

  return (
    <TR className={needsAttention ? 'bg-danger-50/40' : undefined}>
      <TD>
        <div className="font-medium text-fg">{sub.name ?? sub.slug}</div>
        <div className="text-xs text-fg-muted">{sub.ownerEmail ?? `/${sub.slug}`}</div>
      </TD>
      <TD>
        <div className="font-medium">{formatPrice(sub.priceCents)}/mo</div>
        <div className="text-xs text-fg-muted">{sub.planKey ?? '—'}</div>
      </TD>
      <TD>
        <SubscriptionBadge sub={sub} />
        {sub.failedAttempts > 0 && (
          <div className="mt-1 text-xs text-fg-muted">
            {sub.failedAttempts} failed {sub.failedAttempts === 1 ? 'attempt' : 'attempts'}
          </div>
        )}
      </TD>
      <TD>
        <span className={sub.isOverdue ? 'font-medium text-danger-700' : undefined}>{formatDate(sub.currentPeriodEnd)}</span>
        {sub.nextAttemptAt && <div className="text-xs text-fg-muted">retry {formatDate(sub.nextAttemptAt)}</div>}
      </TD>
      <TD className="text-fg-muted">{formatDate(sub.lastChargedAt)}</TD>
      <TD className="text-fg-muted">
        {sub.hasCardOnFile ? `•••• ${sub.paymentLast4 ?? '____'}` : <Badge tone="warning">No card</Badge>}
      </TD>
      <TD>
        {sub.hasCardOnFile && (
          <Button variant="secondary" size="sm" loading={busy} onClick={onRetry}>
            Charge now
          </Button>
        )}
      </TD>
    </TR>
  )
}

function SubscriptionBadge({ sub }: { sub: AdminSubscription }) {
  if (sub.subscriptionStatus === 'suspended') return <Badge tone="danger">Suspended</Badge>
  if (sub.subscriptionStatus === 'past_due') return <Badge tone="danger">Past due</Badge>
  if (sub.isOverdue) return <Badge tone="warning">Due now</Badge>
  if (sub.subscriptionStatus === 'active') return <Badge tone="success">Paid</Badge>
  return <Badge tone="neutral">{sub.subscriptionStatus}</Badge>
}

function ChargeRow({ charge }: { charge: AdminSubscriptionCharge }) {
  return (
    <TR>
      <TD className="whitespace-nowrap text-fg-muted">{formatDate(charge.createdAt)}</TD>
      <TD className="font-medium">{charge.storeName ?? charge.storeSlug}</TD>
      <TD>{formatPrice(charge.amountCents)}</TD>
      <TD>
        {charge.status === 'paid' ? (
          <Badge tone="success">Paid</Badge>
        ) : (
          <>
            <Badge tone="danger">Failed</Badge>
            {charge.failureReason && <div className="mt-1 text-xs text-fg-muted">{charge.failureReason}</div>}
          </>
        )}
      </TD>
    </TR>
  )
}

function BillingStat({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'warning' | 'danger'
}) {
  const iconTone =
    tone === 'danger' ? 'bg-danger-50 text-danger-700' : tone === 'warning' ? 'bg-warning-50 text-warning-700' : 'bg-brand-50 text-brand-600'

  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-card ${iconTone}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">{label}</p>
          <p className="font-display text-2xl font-bold text-fg">{value}</p>
          <p className="truncate text-xs text-fg-muted">{detail}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
