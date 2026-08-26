import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw, Square, Unplug, Wallet } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { SquareConnectResponse, StorePaymentStatus, StoreSubscriptionStatus } from '../../api/types'
import { Badge, Button, Card, CardBody, CardHeader, ErrorState, LoadingPanel } from '../../components/ui'
import { SquarePaymentPanel, type TokenizedPayment } from '../../components/payments/SquarePaymentPanel'
import { PaypalButtons } from '../../components/payments/PaypalButtons'
import { isDevBuild } from '../../lib/runtimeEnv'
import { METHOD_LABELS } from '../onboarding/config'
import { useAuth } from '../../context/AuthContext'

const paymentKey = (slug: string) => ['store-payments', slug] as const
const subscriptionKey = (slug: string) => ['store-subscription', slug] as const

export default function PaymentsTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [oauthReturnMessage, setOauthReturnMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  )
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: paymentKey(slug),
    queryFn: async () => {
      const { data } = await api.get<StorePaymentStatus>(`/stores/${slug}/payments`)
      return data
    },
  })

  const subscriptionQuery = useQuery({
    queryKey: subscriptionKey(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreSubscriptionStatus>(`/stores/${slug}/subscription`)
      return data
    },
  })

  const [squareConnect, setSquareConnect] = useState<SquareConnectResponse | null>(null)
  const [paypalConnect, setPaypalConnect] = useState<SquareConnectResponse | null>(null)

  useEffect(() => {
    const square = searchParams.get('square')
    const paypal = searchParams.get('paypal')
    if (!square && !paypal) {
      return
    }

    const next = new URLSearchParams(searchParams)
    next.delete('square')
    next.delete('paypal')
    setSearchParams(next, { replace: true })

    if (square === 'connected' || paypal === 'connected') {
      setOauthReturnMessage({
        tone: 'success',
        text: square === 'connected' ? 'Square connected. Refreshing status…' : 'PayPal connected. Refreshing status…',
      })
      void queryClient.invalidateQueries({ queryKey: paymentKey(slug) })
      void refetch()
    } else if (square === 'error' || paypal === 'error') {
      setOauthReturnMessage({
        tone: 'danger',
        text: paypal === 'error'
          ? 'PayPal authorization did not finish. Try Connect PayPal again, or contact support if it keeps failing.'
          : isDevBuild
            ? 'Square authorization did not finish. Keep the sandbox dashboard open, then try Connect Square again.'
            : 'Square authorization did not finish. Try Connect Square again, or contact support if it keeps failing.',
      })
    }
  }, [queryClient, refetch, searchParams, setSearchParams, slug])

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SquareConnectResponse>(`/stores/${slug}/payments/square/connect`)
      return data
    },
    onSuccess: (result) => {
      setSquareConnect(result)
      window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<StorePaymentStatus>(`/stores/${slug}/payments/square/disconnect`)
      return data
    },
    onSuccess: (result) => {
      queryClient.setQueryData(paymentKey(slug), result)
    },
  })

  const paypalConnectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SquareConnectResponse>(`/stores/${slug}/payments/paypal/connect`)
      return data
    },
    onSuccess: (result) => {
      setPaypalConnect(result)
      window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer')
    },
  })

  const paypalDisconnectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<StorePaymentStatus>(`/stores/${slug}/payments/paypal/disconnect`)
      return data
    },
    onSuccess: (result) => {
      queryClient.setQueryData(paymentKey(slug), result)
    },
  })

  const updatePaymentMutation = useMutation({
    mutationFn: async (body: TokenizedPayment) => {
      const { data } = await api.post<{ paymentMethodType: string; paymentLast4?: string }>(
        `/stores/${slug}/subscription/payment-method`,
        body,
      )
      return data
    },
    onSuccess: () => {
      void subscriptionQuery.refetch()
    },
  })

  const createSubscriptionPaypalOrder = useCallback(async () => {
    const { data } = await api.post<{ orderId: string }>(`/stores/${slug}/subscription/paypal/order`)
    if (!data.orderId) {
      throw new Error('PayPal did not return an order.')
    }
    return data.orderId
  }, [slug])

  const square = data?.square
  const paypal = data?.paypal
  const connected = square?.status === 'connected'
  const paypalConnected = paypal?.status === 'connected'
  const sub = subscriptionQuery.data
  // Saving a new card is the fix for both states, and it is the one action
  // this panel offers — so say so rather than just showing a status word.
  const billingAlert =
    sub?.subscriptionStatus === 'suspended'
      ? 'We could not collect your subscription after several attempts, so billing is paused. Save a new payment method below to restore it.'
      : sub?.subscriptionStatus === 'past_due'
        ? `A renewal was declined${sub.nextAttemptAt ? `. We will try again on ${formatDate(sub.nextAttemptAt)}` : ''}. Save a new payment method below to settle it sooner.`
        : ''

  // The owner's real question is "am I paid up?", which the raw status word
  // does not answer on its own.
  const subscriptionBadge = !sub ? null : sub.priceCents <= 0 ? (
    <Badge tone="neutral">Free plan</Badge>
  ) : sub.subscriptionStatus === 'suspended' ? (
    <Badge tone="danger">Billing paused</Badge>
  ) : sub.subscriptionStatus === 'past_due' ? (
    <Badge tone="danger">Payment failed</Badge>
  ) : sub.subscriptionStatus === 'active' ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden className="size-3.5" />
      Up to date
    </Badge>
  ) : (
    <Badge tone="warning">Payment required</Badge>
  )
  const squareError =
    extractErrorMessage(connectMutation.error, '') ||
    extractErrorMessage(disconnectMutation.error, '') ||
    square?.lastError ||
    ''
  const paypalError =
    extractErrorMessage(paypalConnectMutation.error, '') ||
    extractErrorMessage(paypalDisconnectMutation.error, '') ||
    paypal?.lastError ||
    ''
  const billingError = extractErrorMessage(updatePaymentMutation.error, '')

  if (isLoading || subscriptionQuery.isLoading) return <LoadingPanel label="Loading payment connections..." />

  if (error) {
    return (
      <div className="rounded-card border border-border bg-surface">
        <ErrorState title="Could not load payments" description="Payment connections could not be loaded." onRetry={() => void refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Platform subscription"
          subtitle="Your payment method for the LGS Card Vault software plan. Shopper charges go to the Square or PayPal account you connect below."
          actions={
            <div className="flex items-center gap-2">
              {subscriptionBadge}
              <Button variant="secondary" size="sm" onClick={() => void subscriptionQuery.refetch()}>
                <RefreshCw aria-hidden className="size-4" />
                Refresh
              </Button>
            </div>
          }
        />
        <CardBody>
          {sub && sub.priceCents <= 0 ? (
            <p className="text-sm text-fg-muted">
              {sub.planName ?? 'Starter'} is free. No platform subscription payment method is required.
            </p>
          ) : sub ? (
            <div className="space-y-4">
              {billingAlert ? (
                <p role="alert" className="rounded-card border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-fg">
                  {billingAlert}
                </p>
              ) : null}

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <PaymentFact label="Plan" value={`${sub.planName ?? sub.planKey ?? '—'} · ${formatPrice(sub.priceCents)}/mo`} />
                <PaymentFact
                  label="Status"
                  value={`${sub.subscriptionStatus}${sub.paymentMethodType ? ` · ${METHOD_LABELS[sub.paymentMethodType as keyof typeof METHOD_LABELS] ?? sub.paymentMethodType}` : ''}${sub.paymentLast4 ? ` •••• ${sub.paymentLast4}` : ''}`}
                />
                <PaymentFact label="Next bill" value={formatDate(sub.currentPeriodEnd)} />
                <PaymentFact label="Last charged" value={formatDate(sub.lastChargedAt)} />
                {isDevBuild && (
                  <PaymentFact label="Billing mode" value={`${sub.mode} (${sub.environment})`} wide />
                )}
              </dl>

              {sub.mode === 'square' ? (
                <SquarePaymentPanel
                  applicationId={sub.applicationId}
                  locationId={sub.locationId}
                  environment={sub.environment}
                  // Zero keeps this a vault-only update: saving a new card must
                  // never charge a renewal early.
                  priceCents={0}
                  currency={sub.currency}
                  countryCode={sub.countryCode}
                  billingEmail={user?.email ?? ''}
                  confirmLabel="Save new payment method"
                  layout="vault"
                  onTokenized={(p) => updatePaymentMutation.mutate(p)}
                />
              ) : isDevBuild ? (
                <Button
                  variant="secondary"
                  loading={updatePaymentMutation.isPending}
                  onClick={() =>
                    updatePaymentMutation.mutate({
                      methodType: 'card',
                      token: `mock-card-${Date.now().toString(36)}`,
                      last4: '4242',
                      verificationToken: '',
                    })
                  }
                >
                  <CreditCard aria-hidden className="size-4" />
                  Simulate card update (dev only)
                </Button>
              ) : (
                <p className="text-sm text-fg-muted">
                  Platform billing is not configured yet. Contact support to update your subscription payment method.
                </p>
              )}

              {sub.paypal?.enabled ? (
                <div className="space-y-2">
                  {sub.mode === 'square' ? <p className="text-xs font-medium text-fg-muted">Or save PayPal for platform dues</p> : null}
                  <PaypalButtons
                    clientId={sub.paypal.clientId}
                    environment={sub.paypal.environment}
                    currency={sub.paypal.currency}
                    disabled={updatePaymentMutation.isPending}
                    createOrder={createSubscriptionPaypalOrder}
                    onApproved={async (orderId) => {
                      await updatePaymentMutation.mutateAsync({
                        methodType: 'paypal',
                        token: orderId,
                        last4: '',
                        verificationToken: '',
                      })
                    }}
                  />
                </div>
              ) : null}

              {billingError ? (
                <p role="alert" className="text-sm font-medium text-danger-700">
                  {billingError}
                </p>
              ) : null}

              {updatePaymentMutation.isSuccess && (
                <p className="flex items-center gap-2 text-sm font-medium text-success-700">
                  <CheckCircle2 aria-hidden className="size-4" />
                  Payment method updated.
                </p>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Customer checkout (Square)"
          subtitle="Connect Square so shoppers can pay your store at checkout."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              <RefreshCw aria-hidden className="size-4" />
              Refresh
            </Button>
          }
        />
        <CardBody>
          {oauthReturnMessage && !oauthReturnMessage.text.includes('PayPal') && (
            <p
              role="status"
              className={`mb-4 text-sm font-medium ${oauthReturnMessage.tone === 'success' ? 'text-success-700' : 'text-danger-700'}`}
            >
              {oauthReturnMessage.text}
            </p>
          )}
          <div className="rounded-card border border-border bg-bg p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-card bg-surface text-fg shadow-card">
                  <Square aria-hidden className="size-6" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-bold text-fg">Square</h3>
                    <Badge tone={connected ? 'success' : square?.status === 'error' ? 'danger' : 'neutral'}>
                      {connected ? 'Connected' : square?.status === 'error' ? 'Needs attention' : 'Not connected'}
                    </Badge>
                    {square?.environment && (
                      <Badge tone="neutral">
                        {square.environment === 'sandbox' && !isDevBuild ? 'Test mode' : square.environment}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-muted">
                    Let this store authorize Square so checkout can charge through the store owner&apos;s Square seller account.
                    Enable the correct sales tax on that Square location — pickup card payments collect it automatically.
                  </p>

                  {!connected && isDevBuild && (
                    <div className="mt-3 max-w-2xl rounded-btn border border-border bg-surface px-3 py-3 text-sm leading-6 text-fg-muted">
                      <p className="font-medium text-fg">Square sandbox (developers)</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        <li>
                          In the{' '}
                          <a
                            href="https://developer.squareup.com/apps"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                          >
                            Square Developer Console
                          </a>
                          , open this app with <span className="font-medium text-fg">Sandbox</span> selected.
                        </li>
                        <li>
                          Go to <span className="font-medium text-fg">Sandbox test accounts</span> and open{' '}
                          <span className="font-medium text-fg">Square Dashboard</span> for a test seller. Leave that tab open.
                        </li>
                        <li>
                          Click <span className="font-medium text-fg">Connect Square</span> and approve access in the new tab.
                        </li>
                      </ol>
                    </div>
                  )}

                  {!connected && !isDevBuild && (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
                      You will sign in with Square and approve access so this store can accept card payments at checkout.
                    </p>
                  )}

                  {squareConnect && !connected && (
                    <p className="mt-3 text-sm leading-6 text-fg-muted">
                      Finish authorization in the Square tab
                      {squareConnect.environment === 'sandbox' ? ' (test mode)' : ''}. If it did not open,{' '}
                      <a
                        href={squareConnect.authorizationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                      >
                        continue to Square
                      </a>
                      , then return here and click Refresh.
                    </p>
                  )}

                  {connected && (
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <PaymentFact label="Merchant" value={square.merchantId ?? '-'} />
                      <PaymentFact label="Connected" value={formatDate(square.connectedAt)} />
                      <PaymentFact label="Token expires" value={formatDate(square.tokenExpiresAt)} />
                      <PaymentFact label="Scopes" value={square.scopes.join(', ') || '-'} wide />
                    </dl>
                  )}

                  {squareError && (
                    <p role="alert" className="mt-3 text-sm font-medium text-danger-700">
                      {squareError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {connected ? (
                  <>
                    <Button variant="secondary" size="sm" loading={connectMutation.isPending} onClick={() => connectMutation.mutate()}>
                      <ExternalLink aria-hidden className="size-4" />
                      Reconnect
                    </Button>
                    <Button variant="danger" size="sm" loading={disconnectMutation.isPending} onClick={() => disconnectMutation.mutate()}>
                      <Unplug aria-hidden className="size-4" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button loading={connectMutation.isPending} onClick={() => connectMutation.mutate()}>
                    <CheckCircle2 aria-hidden className="size-4" />
                    Connect Square
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Customer checkout (PayPal)"
          subtitle="Connect PayPal so shoppers can pay your store. Captures settle to this store's PayPal account."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              <RefreshCw aria-hidden className="size-4" />
              Refresh
            </Button>
          }
        />
        <CardBody>
          {oauthReturnMessage && oauthReturnMessage.text.includes('PayPal') ? (
            <p
              role="status"
              className={`mb-4 text-sm font-medium ${oauthReturnMessage.tone === 'success' ? 'text-success-700' : 'text-danger-700'}`}
            >
              {oauthReturnMessage.text}
            </p>
          ) : null}
          <div className="rounded-card border border-border bg-bg p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-card bg-surface text-fg shadow-card">
                  <Wallet aria-hidden className="size-6" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-bold text-fg">PayPal</h3>
                    <Badge tone={paypalConnected ? 'success' : paypal?.status === 'error' ? 'danger' : 'neutral'}>
                      {paypalConnected ? 'Connected' : paypal?.status === 'error' ? 'Needs attention' : 'Not connected'}
                    </Badge>
                    {paypal?.environment && (
                      <Badge tone="neutral">
                        {paypal.environment === 'sandbox' && !isDevBuild ? 'Test mode' : paypal.environment}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-muted">
                    Authorize PayPal so checkout can charge the store owner&apos;s PayPal account. PayPal uses the
                    same sales-tax quote as Square when Square is connected. In a sales-tax state, $0 quoted tax
                    blocks PayPal the same as cards. When PayPal is the online processor, Apple Pay and Google Pay
                    settle to this PayPal account (keep those boxes checked on the PayPal app).
                  </p>

                  {!paypalConnected && isDevBuild && (
                    <div className="mt-3 max-w-2xl rounded-btn border border-border bg-surface px-3 py-3 text-sm leading-6 text-fg-muted">
                      <p className="font-medium text-fg">PayPal sandbox (developers)</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        <li>
                          In the{' '}
                          <a
                            href="https://developer.paypal.com/dashboard/applications"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                          >
                            PayPal Developer Dashboard
                          </a>
                          , open this platform app with <span className="font-medium text-fg">Sandbox</span> selected.
                        </li>
                        <li>
                          Partner referrals need a Commerce Platform / Partner app. Register the return URL{' '}
                          <span className="font-medium text-fg">http://127.0.0.1:8000/api/integrations/paypal/callback</span>.
                        </li>
                        <li>
                          Click <span className="font-medium text-fg">Connect PayPal</span> and approve access in the new tab.
                        </li>
                      </ol>
                    </div>
                  )}

                  {!paypalConnected && !isDevBuild && (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
                      You will sign in with PayPal and approve access so this store can accept PayPal at checkout.
                    </p>
                  )}

                  {paypalConnect && !paypalConnected && (
                    <p className="mt-3 text-sm leading-6 text-fg-muted">
                      Finish authorization in the PayPal tab
                      {paypalConnect.environment === 'sandbox' ? ' (test mode)' : ''}. If it did not open,{' '}
                      <a
                        href={paypalConnect.authorizationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                      >
                        continue to PayPal
                      </a>
                      , then return here and click Refresh.
                    </p>
                  )}

                  {paypalConnected && (
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <PaymentFact label="Merchant" value={paypal?.merchantId ?? '-'} />
                      <PaymentFact label="Connected" value={formatDate(paypal?.connectedAt)} />
                      <PaymentFact label="Token expires" value={formatDate(paypal?.tokenExpiresAt)} />
                      <PaymentFact label="Scopes" value={paypal?.scopes?.join(', ') || '-'} wide />
                    </dl>
                  )}

                  {paypalError && (
                    <p role="alert" className="mt-3 text-sm font-medium text-danger-700">
                      {paypalError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {paypalConnected ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={paypalConnectMutation.isPending}
                      onClick={() => paypalConnectMutation.mutate()}
                    >
                      <ExternalLink aria-hidden className="size-4" />
                      Reconnect
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={paypalDisconnectMutation.isPending}
                      onClick={() => paypalDisconnectMutation.mutate()}
                    >
                      <Unplug aria-hidden className="size-4" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button loading={paypalConnectMutation.isPending} onClick={() => paypalConnectMutation.mutate()}>
                    <CheckCircle2 aria-hidden className="size-4" />
                    Connect PayPal
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Before you take live payments"
          subtitle="Shoppers enter payment details only in Square or PayPal. Finish these steps for this store."
        />
        <CardBody>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-fg">
            <li>Connect Square and/or PayPal on this page and approve access so checkout can charge your seller account.</li>
            <li>
              In Square Dashboard for this location, turn on the correct sales tax. In a sales-tax state, online
              checkout will not complete if Square quotes $0 tax (PayPal uses that same quote).
            </li>
            <li>Never type card numbers into LGS Card Vault, email, or chat. Use only Square’s or PayPal’s payment form.</li>
            <li>
              For PayPal Apple Pay, register this site’s domain in the PayPal Developer Dashboard (Features →
              Apple Pay) and host PayPal’s domain association file. Square Apple Pay uses Square’s file at the
              same path, so a domain can only verify one of those at a time.
            </li>
            <li>
              Chargebacks are handled in Square’s dispute console or PayPal’s Resolution Center, matching how the
              shopper paid. A flag appears on the order here when the processor notifies us. Collect pickup proof
              (name, time, staff notes). We do not automatically restock disputed orders.
            </li>
          </ol>
        </CardBody>
      </Card>
    </div>
  )
}

function PaymentFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-fg">{value}</dd>
    </div>
  )
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
