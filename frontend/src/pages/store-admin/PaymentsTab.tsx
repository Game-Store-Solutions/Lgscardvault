import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CheckCircle2, CreditCard, ExternalLink, Info, Pencil, Plus, RefreshCw, Unplug } from 'lucide-react'
import api, { extractErrorMessage, formatPrice, parsePriceInput } from '../../api/client'
import type { SquareConnectResponse, StorePaymentAccount, StorePaymentStatus, StoreSubscriptionStatus } from '../../api/types'
import { Badge, Button, ErrorState, Input, LoadingPanel, Modal } from '../../components/ui'
import { SquarePaymentPanel, type TokenizedPayment } from '../../components/payments/SquarePaymentPanel'
import { PaypalButtons } from '../../components/payments/PaypalButtons'
import { cx } from '../../lib/cx'
import { isDevBuild } from '../../lib/runtimeEnv'
import { METHOD_LABELS } from '../onboarding/config'
import { useAuth } from '../../context/AuthContext'

const paymentKey = (slug: string) => ['store-payments', slug] as const
const subscriptionKey = (slug: string) => ['store-subscription', slug] as const

type ChargeSource = 'vault' | 'square' | 'paypal'

const STORE_SALES_CHECKOUT_COPY = 'Customer checkout through these accounts.'
const SALES_CHECKOUT_METHODS_TIP =
  'Store sales checkout only supports Square and PayPal. The nightly debit card cannot be used for customer checkout.'
const NIGHTLY_PAYMENT_COPY =
  'Nightly fees charge a debit card (or PayPal) on our platform account. Square here means enter that debit card through Square, not your store’s Square sales Connect.'
type BuyoutRequest = {
  amountCents?: number
  source: ChargeSource
  token?: string
  verificationToken?: string
}

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
    isFetching,
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
  const [managing, setManaging] = useState<'square' | 'paypal' | 'card' | 'sales' | null>(null)
  const [vaultBrand, setVaultBrand] = useState<ProcessorBrand>('card')
  const [editingCard, setEditingCard] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [syncOrigin, setSyncOrigin] = useState<'sales' | 'nightly' | null>(null)
  /** After OAuth, attach that seller account for store sales (not nightly vault). */
  const pendingSalesConnect = useRef<'square' | 'paypal' | null>(readPendingSalesConnect(slug))
  const [payIntent, setPayIntent] = useState<'full' | 'custom' | null>(null)
  const [chargeSource, setChargeSource] = useState<ChargeSource>('vault')
  const [customAmount, setCustomAmount] = useState('')
  const [lastAppliedCents, setLastAppliedCents] = useState<number | null>(null)

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
      const syncedBrand = square === 'connected' ? 'square' : 'paypal'
      const name = syncedBrand === 'paypal' ? 'PayPal' : 'Square'
      setOauthReturnMessage({
        tone: 'success',
        text: `${name} connected. Refreshing status…`,
      })
      void queryClient.invalidateQueries({ queryKey: paymentKey(slug) })
      void queryClient.invalidateQueries({ queryKey: subscriptionKey(slug) })
      void refetch()
      void subscriptionQuery.refetch()
      if (pendingSalesConnect.current === syncedBrand || readPendingSalesConnect(slug) === syncedBrand) {
        pendingSalesConnect.current = null
        writePendingSalesConnect(slug, null)
        setSyncOrigin('nightly')
        setSyncNote(`Store sales checkout now uses ${name}.`)
      }
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
  }, [queryClient, refetch, searchParams, setSearchParams, slug, subscriptionQuery.refetch])

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
      setEditingCard(false)
      setSyncNote(null)
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

  const createBuyoutPaypalOrder = useCallback(async (amountCents: number) => {
    const { data } = await api.post<{ orderId: string }>(`/stores/${slug}/subscription/paypal/order`, { amountCents })
    if (!data.orderId) {
      throw new Error('PayPal did not return an order.')
    }
    return data.orderId
  }, [slug])

  const buyoutMutation = useMutation({
    mutationFn: async (body: BuyoutRequest) => {
      const { data } = await api.post<StoreSubscriptionStatus & { chargedCents?: number }>(
        `/stores/${slug}/subscription/buyout`,
        {
          source: body.source,
          ...(body.amountCents != null ? { amountCents: body.amountCents } : {}),
          ...(body.token ? { token: body.token, verificationToken: body.verificationToken ?? '' } : {}),
        },
      )
      return data
    },
    onSuccess: (result, body) => {
      queryClient.setQueryData(subscriptionKey(slug), result)
      setPayIntent(null)
      setCustomAmount('')
      setLastAppliedCents(result.chargedCents ?? body.amountCents ?? null)
    },
  })

  const square = data?.square
  const paypal = data?.paypal
  const connected = square?.status === 'connected'
  const paypalConnected = paypal?.status === 'connected'
  const sub = subscriptionQuery.data
  const vaultBrandOnFile = sub ? feeProcessorBrand(sub) : 'card'

  useEffect(() => {
    if (managing !== 'card') {
      setEditingCard(false)
      return
    }
    setVaultBrand(vaultBrandOnFile)
    setEditingCard(false)
    // Snapshot on open so picking PayPal/Square in the modal is not reset by refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managing])

  const startSalesConnect = (brand: 'square' | 'paypal') => {
    pendingSalesConnect.current = brand
    writePendingSalesConnect(slug, brand)
    setSyncOrigin('nightly')
    setSyncNote(`Continue in the ${brand === 'paypal' ? 'PayPal' : 'Square'} window to authorize store sales.`)
    if (brand === 'paypal') paypalConnectMutation.mutate()
    else connectMutation.mutate()
  }

  /** Push store-sales Connect to match the vaulted nightly method (never the reverse with a card). */
  const syncSalesToNightly = () => {
    setSyncOrigin('nightly')
    if (!sub?.paymentConfigured) {
      setManaging('card')
      setVaultBrand('card')
      setEditingCard(true)
      setSyncNote('Save a debit card or PayPal for nightly payment first.')
      return
    }
    if (vaultBrandOnFile === 'paypal') {
      if (paypalConnected) {
        setSyncNote('Store sales checkout already uses PayPal.')
        return
      }
      startSalesConnect('paypal')
      return
    }
    if (connected) {
      setSyncNote('Store sales checkout already uses Square.')
      return
    }
    startSalesConnect('square')
  }

  /** Open nightly vault flow so platform billing can match the unique sales processor. */
  const syncNightlyToSales = () => {
    setSyncOrigin('sales')
    const brand = connected && !paypalConnected ? 'square' : paypalConnected && !connected ? 'paypal' : null
    if (!brand) {
      setManaging('sales')
      setSyncNote(
        connected && paypalConnected
          ? 'Keep Square or PayPal for store sales, then sync nightly payment to match it.'
          : 'Connect Square or PayPal for store sales first, then sync.',
      )
      return
    }
    setManaging('card')
    setVaultBrand(brand === 'paypal' ? 'paypal' : 'card')
    setEditingCard(brand !== 'paypal')
    setSyncNote(
      brand === 'paypal'
        ? 'Save PayPal for nightly payment so platform fees use the same processor as store sales.'
        : 'Save a debit card for nightly payment. Store sales Square Connect stays separate.',
    )
  }
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
  const isUsagePlan = sub?.billingModel === 'usage'
  const isPaidInFull = Boolean(sub?.capReached) || sub?.billingModel === 'flat'
  /** Nightly % of sales only applies on usage before this month’s obligation is met. */
  const chargesNightlyFees = Boolean(isUsagePlan && !sub?.capReached)
  const subscriptionBadge = !sub ? null : sub.subscriptionStatus === 'suspended' ? (
    <Badge tone="danger">Billing paused</Badge>
  ) : sub.subscriptionStatus === 'past_due' ? (
    <Badge tone="danger">Payment failed</Badge>
  ) : isPaidInFull ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden className="size-3.5" />
      Month paid
    </Badge>
  ) : isUsagePlan ? (
    <Badge tone="neutral">Pay as you sell</Badge>
  ) : sub.subscriptionStatus === 'active' ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden className="size-3.5" />
      Up to date
    </Badge>
  ) : sub.priceCents <= 0 ? (
    <Badge tone="neutral">Free plan</Badge>
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
  const buyoutError = extractErrorMessage(buyoutMutation.error, '')
  const remainingCents = sub?.buyoutCents ?? 0
  const customCents = parsePriceInput(customAmount)
  const customAmountError =
    customAmount.trim() === '' || customCents == null
      ? ''
      : customCents < 1
        ? 'Enter an amount of at least $0.01.'
        : customCents > remainingCents
          ? `That is more than the remaining ${formatPrice(remainingCents)}.`
          : remainingCents >= 100 && customCents < 100
            ? 'Enter at least $1.00, or pay the remaining balance in full.'
            : ''
  const canSubmitCustom = customCents != null && customCents >= 1 && customAmountError === ''
  const confirmCents = payIntent === 'custom' ? customCents ?? 0 : remainingCents
  const confirmClosesCap = confirmCents >= remainingCents && remainingCents > 0
  const hasSquareVault = Boolean(sub?.paymentConfigured && sub.billingProvider !== 'paypal')
  const hasPaypalVault = Boolean(sub?.paymentConfigured && sub.billingProvider === 'paypal')
  const squareChargeReady = connected || hasSquareVault
  const paypalChargeReady = paypalConnected || hasPaypalVault
  const squareNeedsForm = chargeSource === 'square' && !hasSquareVault
  const paypalNeedsForm = chargeSource === 'paypal' && !hasPaypalVault
  const selectedSourceReady =
    chargeSource === 'vault'
      ? Boolean(sub?.paymentConfigured)
      : chargeSource === 'square'
        ? squareChargeReady
        : paypalChargeReady

  const openPay = (intent: 'full' | 'custom') => {
    if (sub?.paymentConfigured) setChargeSource('vault')
    else if (connected) setChargeSource('square')
    else if (paypalConnected) setChargeSource('paypal')
    else setChargeSource('vault')
    setPayIntent(intent)
  }

  const submitBuyout = (extra: Partial<BuyoutRequest> = {}) => {
    buyoutMutation.mutate({
      source: chargeSource,
      amountCents: payIntent === 'custom' ? confirmCents : undefined,
      ...extra,
    })
  }

  if (isLoading || subscriptionQuery.isLoading) return <LoadingPanel label="Loading payment connections..." />

  if (error) {
    return (
      <div className="border border-border bg-surface">
        <ErrorState title="Could not load payments" description="Payment connections could not be loaded." onRetry={() => void refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {oauthReturnMessage ? (
        <p
          role="status"
          className={cx(
            'text-sm font-medium',
            oauthReturnMessage.tone === 'success' ? 'text-success-700' : 'text-danger-700',
          )}
        >
          {oauthReturnMessage.text}
        </p>
      ) : null}

      {billingAlert ? (
        <p role="alert" className="rounded-card border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-fg">
          {billingAlert}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <ProcessorCard
          brand="square"
          name="Square"
          purpose="Store sales"
          connected={connected}
          environment={square?.environment}
          error={squareError}
          pendingUrl={!connected ? squareConnect?.authorizationUrl : undefined}
          connecting={connectMutation.isPending}
          refreshing={isFetching}
          onConnect={() => connectMutation.mutate()}
          onRefresh={() => void refetch()}
          onOpen={() => setManaging('square')}
        />
        <ProcessorCard
          brand="paypal"
          name="PayPal"
          purpose="Store sales"
          connected={paypalConnected}
          environment={paypal?.environment}
          error={paypalError}
          pendingUrl={!paypalConnected ? paypalConnect?.authorizationUrl : undefined}
          connecting={paypalConnectMutation.isPending}
          refreshing={isFetching}
          onConnect={() => paypalConnectMutation.mutate()}
          onRefresh={() => void refetch()}
          onOpen={() => setManaging('paypal')}
        />
        <ProcessorCard
          brand="card"
          name="Debit card"
          purpose="Nightly fees"
          highlighted={chargesNightlyFees && Boolean(sub?.paymentConfigured)}
          connected={chargesNightlyFees && Boolean(sub?.paymentConfigured)}
          detail={sub?.paymentLast4 ? `•••• ${sub.paymentLast4}` : undefined}
          footerLabel="we charge this"
          error={billingAlert || billingError}
          connecting={updatePaymentMutation.isPending}
          showRefresh={false}
          onConnect={() => setManaging('card')}
          onOpen={() => setManaging('card')}
        />
      </div>
      {sub ? (
        <p className="text-sm leading-6 text-fg-muted">
          <span className="font-semibold text-fg">Store sales checkout</span> runs through Square and PayPal Connect.
          {chargesNightlyFees ? (
            <>
              {' '}
              <span className="font-semibold text-fg">Nightly fees</span> charge {feeSourceLabel(sub)}.
            </>
          ) : null}
        </p>
      ) : null}

      <Modal
        open={managing === 'sales'}
        onClose={() => setManaging(null)}
        title="Store sales checkout"
        footer={
          <Button variant="secondary" onClick={() => setManaging(null)}>
            Done
          </Button>
        }
      >
        <p className="text-sm leading-6 text-fg-muted">{STORE_SALES_CHECKOUT_COPY}</p>
        <div className="mt-4 space-y-3">
          <SalesAccountRow
            brand="square"
            name="Square"
            connected={connected}
            connecting={connectMutation.isPending}
            onConnect={() => connectMutation.mutate()}
            onManage={() => setManaging('square')}
          />
          <SalesAccountRow
            brand="paypal"
            name="PayPal"
            connected={paypalConnected}
            connecting={paypalConnectMutation.isPending}
            onConnect={() => paypalConnectMutation.mutate()}
            onManage={() => setManaging('paypal')}
          />
          <DisabledSalesCardRow />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <SyncAllPayments
            aligned={
              Boolean(sub?.paymentConfigured)
              && ((connected && !paypalConnected && vaultBrandOnFile !== 'paypal')
                || (paypalConnected && !connected && vaultBrandOnFile === 'paypal'))
            }
            alignedMessage="Nightly payment already matches this checkout processor."
            hint="Nightly payment will vault a matching debit card or PayPal for platform fees (seller Connect stays separate)."
            note={syncOrigin === 'sales' ? syncNote : null}
            syncing={updatePaymentMutation.isPending}
            disabled={!connected && !paypalConnected}
            onSync={syncNightlyToSales}
          />
        </div>
      </Modal>
      <ManageProcessorModal
        open={managing === 'square'}
        name="Square"
        account={square}
        connecting={connectMutation.isPending}
        disconnecting={disconnectMutation.isPending}
        onClose={() => setManaging(null)}
        onReconnect={() => connectMutation.mutate()}
        onDisconnect={() => {
          disconnectMutation.mutate()
          setManaging(null)
        }}
      />
      <ManageProcessorModal
        open={managing === 'paypal'}
        name="PayPal"
        account={paypal ?? null}
        connecting={paypalConnectMutation.isPending}
        disconnecting={paypalDisconnectMutation.isPending}
        onClose={() => setManaging(null)}
        onReconnect={() => paypalConnectMutation.mutate()}
        onDisconnect={() => {
          paypalDisconnectMutation.mutate()
          setManaging(null)
        }}
      />
      <Modal
        open={managing === 'card'}
        onClose={() => setManaging(null)}
        title="Nightly debit card"
        footer={
          <Button variant="secondary" onClick={() => setManaging(null)}>
            Done
          </Button>
        }
      >
        {sub ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-fg-muted">{NIGHTLY_PAYMENT_COPY}</p>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Charge nightly fees with</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <ChargeSourceButton
                  brand="square"
                  name="Square"
                  detail="Enter debit card"
                  selected={vaultBrand === 'square'}
                  onSelect={() => {
                    setVaultBrand('square')
                    setEditingCard(true)
                  }}
                />
                <ChargeSourceButton
                  brand="paypal"
                  name="PayPal"
                  detail={
                    vaultBrandOnFile === 'paypal'
                      ? 'On file'
                      : sub.paypal?.enabled
                        ? 'Vault PayPal'
                        : undefined
                  }
                  selected={vaultBrand === 'paypal'}
                  disabled={!sub.paypal?.enabled}
                  unavailableLabel="Not available"
                  onSelect={() => {
                    setVaultBrand('paypal')
                    setEditingCard(vaultBrandOnFile !== 'paypal')
                  }}
                />
                <ChargeSourceButton
                  brand="card"
                  name="Debit card"
                  detail={sub.paymentLast4 ? `•••• ${sub.paymentLast4}` : 'Add debit card'}
                  selected={vaultBrand === 'card'}
                  onSelect={() => {
                    setVaultBrand('card')
                    setEditingCard(!sub.paymentConfigured || vaultBrandOnFile === 'paypal')
                  }}
                  onEdit={() => {
                    setVaultBrand('card')
                    setEditingCard(true)
                  }}
                />
              </div>
            </div>
            {vaultBrand === 'paypal' ? (
              vaultBrandOnFile === 'paypal' && !editingCard ? (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-fg-muted">
                    PayPal is vaulted for nightly payment.
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => setEditingCard(true)}>
                    Replace PayPal vault
                  </Button>
                </div>
              ) : (
                <NightlyVaultFields
                  brand="paypal"
                  sub={sub}
                  email={user?.email ?? ''}
                  saving={updatePaymentMutation.isPending}
                  error={billingError}
                  saved={updatePaymentMutation.isSuccess}
                  onSquareToken={(p) => updatePaymentMutation.mutate(p)}
                  onPaypalApproved={async (orderId) => {
                    await updatePaymentMutation.mutateAsync({
                      methodType: 'paypal',
                      token: orderId,
                      last4: '',
                      verificationToken: '',
                    })
                  }}
                  createPaypalOrder={createSubscriptionPaypalOrder}
                />
              )
            ) : vaultBrand === 'square' || editingCard || !sub.paymentConfigured ? (
              <NightlyVaultFields
                brand={vaultBrand === 'square' ? 'square' : 'card'}
                sub={sub}
                email={user?.email ?? ''}
                saving={updatePaymentMutation.isPending}
                error={billingError}
                saved={updatePaymentMutation.isSuccess}
                onSquareToken={(p) => updatePaymentMutation.mutate(p)}
                onPaypalApproved={async (orderId) => {
                  await updatePaymentMutation.mutateAsync({
                    methodType: 'paypal',
                    token: orderId,
                    last4: '',
                    verificationToken: '',
                  })
                }}
                createPaypalOrder={createSubscriptionPaypalOrder}
              />
            ) : (
              <p className="text-sm leading-6 text-fg-muted">
                {sub.paymentLast4
                  ? `Debit card •••• ${sub.paymentLast4} is on file. That is what we charge nightly. Use the pencil to replace it.`
                  : 'Use the pencil on Debit card to enter the card we charge nightly.'}
              </p>
            )}
            <div className="border-t border-border pt-4">
              <SyncAllPayments
                aligned={
                  Boolean(sub.paymentConfigured)
                  && ((vaultBrandOnFile === 'paypal' && paypalConnected)
                    || (vaultBrandOnFile !== 'paypal' && connected))
                }
                alignedMessage={`Store sales checkout already uses ${vaultBrandOnFile === 'paypal' ? 'PayPal' : 'Square'}.`}
                hint={
                  vaultBrandOnFile === 'paypal'
                    ? 'Connect PayPal for store sales to match this vaulted PayPal.'
                    : 'Connect Square for store sales. Nightly fees keep charging this debit card.'
                }
                note={syncOrigin === 'nightly' ? syncNote : null}
                syncing={connectMutation.isPending || paypalConnectMutation.isPending}
                disabled={!sub.paymentConfigured}
                onSync={syncSalesToNightly}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      {sub ? (
        <div className="space-y-5 border-t border-border pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-fg">Platform plan</h2>
              <p className="mt-0.5 text-sm text-fg-muted">{planSummary(sub)}</p>
            </div>
            {subscriptionBadge}
          </div>

          {isUsagePlan || isPaidInFull ? (
            <UsageProgress
              sub={sub}
              salesSquare={connected}
              salesPaypal={paypalConnected}
              feeLabel={feeSourceLabel(sub)}
              salesSyncNote={managing === null && syncOrigin === 'sales' ? syncNote : null}
              nightlySyncNote={managing === null && syncOrigin === 'nightly' ? syncNote : null}
              syncing={connectMutation.isPending || paypalConnectMutation.isPending}
              onEditSalesSource={() => {
                setSyncNote(null)
                setManaging('sales')
              }}
              onEditFeeSource={() => {
                setSyncNote(null)
                setManaging('card')
              }}
              onSyncSales={syncNightlyToSales}
              onSyncNightly={syncSalesToNightly}
            />
          ) : null}

          {sub.canBuyout ? (
            <div className="space-y-4 border border-border bg-surface px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">Pay toward this month</p>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    {formatPrice(sub.remainingCapCents)} left of {formatPrice(sub.capCents)} for this billing month.
                    Paying the rest early turns off the {formatFeePercent(sub.todayFeePercent)} nightly take until next
                    month.
                    {sub.currentPeriodEnd && sub.willAutoChargeRemainder
                      ? ` Otherwise the card on file is charged on ${formatPeriodEnd(sub.currentPeriodEnd)}.`
                      : ''}
                  </p>
                </div>
                <Button onClick={() => openPay('full')}>Pay remaining {formatPrice(sub.buyoutCents)}</Button>
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <Input
                  label="Custom amount"
                  inputMode="decimal"
                  placeholder="25.00"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  error={customAmountError || undefined}
                  hint={!customAmountError ? `Applied to the remaining ${formatPrice(sub.buyoutCents)}` : undefined}
                  wrapperClassName="min-w-[12rem] flex-1"
                />
                <Button
                  variant="secondary"
                  disabled={!canSubmitCustom}
                  onClick={() => openPay('custom')}
                >
                  Pay custom amount
                </Button>
              </div>
            </div>
          ) : null}

          {buyoutMutation.isSuccess ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success-700">
              <CheckCircle2 aria-hidden className="size-4" />
              {sub.capReached
                ? 'This month is paid. Nightly sales fees resume next month.'
                : lastAppliedCents != null
                  ? `Applied ${formatPrice(lastAppliedCents)} toward this month.`
                  : 'Payment applied toward this month.'}
            </p>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={payIntent != null}
        onClose={() => setPayIntent(null)}
        title={confirmClosesCap ? 'Pay in full' : 'Pay custom amount'}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayIntent(null)}>
              Cancel
            </Button>
            {squareNeedsForm || paypalNeedsForm ? null : (
              <Button
                loading={buyoutMutation.isPending}
                disabled={confirmCents < 1 || !selectedSourceReady}
                onClick={() => submitBuyout()}
              >
                Charge {formatPrice(confirmCents)}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-fg-muted">
            {confirmClosesCap
              ? `This ${formatPrice(confirmCents)} payment is added to the cap progress bar and finishes the ${sub ? formatPrice(sub.capCents) : ''} total. Nightly ${sub ? formatFeePercent(sub.todayFeePercent) : '10%'} fees stop after that.`
              : `This ${formatPrice(confirmCents)} payment is added to the cap progress bar. Nightly ${sub ? formatFeePercent(sub.todayFeePercent) : '10%'} of store sales still charge ${sub ? feeSourceLabel(sub) : 'the debit card on file'} until the cap is reached.`}
          </p>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Add this payment from</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <ChargeSourceButton
                brand="square"
                name="Square"
                detail={
                  hasSquareVault
                    ? sub?.paymentLast4
                      ? `Debit card •••• ${sub.paymentLast4}`
                      : 'Debit card on file'
                    : connected
                      ? 'Enter debit card'
                      : undefined
                }
                selected={chargeSource === 'square'}
                disabled={!squareChargeReady}
                unavailableLabel="Add debit card first"
                onSelect={() => setChargeSource('square')}
              />
              <ChargeSourceButton
                brand="paypal"
                name="PayPal"
                detail={paypalConnected ? 'Connected' : hasPaypalVault ? 'PayPal on file' : undefined}
                selected={chargeSource === 'paypal'}
                disabled={!paypalChargeReady}
                unavailableLabel="Not connected"
                onSelect={() => setChargeSource('paypal')}
              />
              <ChargeSourceButton
                brand="card"
                name="Debit card"
                detail={sub?.paymentLast4 ? `•••• ${sub.paymentLast4}` : undefined}
                selected={chargeSource === 'vault'}
                disabled={!sub?.paymentConfigured}
                unavailableLabel="Not on file"
                onSelect={() => setChargeSource('vault')}
              />
            </div>
          </div>
          {squareNeedsForm && sub?.mode === 'square' ? (
            <SquarePaymentPanel
              applicationId={sub.applicationId}
              locationId={sub.locationId}
              environment={sub.environment}
              priceCents={confirmCents}
              currency={sub.currency}
              countryCode={sub.countryCode}
              billingEmail={user?.email ?? ''}
              confirmLabel={`Pay ${formatPrice(confirmCents)} with Square`}
              layout="vault"
              onTokenized={(p) =>
                submitBuyout({ token: p.token, verificationToken: p.verificationToken })
              }
            />
          ) : null}
          {squareNeedsForm && sub?.mode !== 'square' && isDevBuild ? (
            <Button
              variant="secondary"
              loading={buyoutMutation.isPending}
              onClick={() => submitBuyout({ token: `mock-card-${Date.now().toString(36)}` })}
            >
              Simulate Square charge (dev only)
            </Button>
          ) : null}
          {paypalNeedsForm && sub?.paypal?.enabled ? (
            <PaypalButtons
              clientId={sub.paypal.clientId}
              environment={sub.paypal.environment}
              currency={sub.paypal.currency}
              disabled={buyoutMutation.isPending}
              createOrder={() => createBuyoutPaypalOrder(confirmCents)}
              onApproved={async (orderId) => {
                submitBuyout({ token: orderId })
              }}
            />
          ) : null}
          {chargeSource === 'vault' && !sub?.paymentConfigured ? (
            <p className="text-sm text-fg-muted">
              Save a debit card (via Square) or vault PayPal first. That is what we charge.
            </p>
          ) : null}
          {buyoutError ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {buyoutError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

const PROCESSOR_BRAND = {
  square: {
    card: 'bg-[#006AFF] text-white border-transparent shadow-[0_8px_24px_-12px_rgba(0,106,255,0.7)] dark:bg-[#0054D2]',
    plus: 'bg-white text-[#006AFF]',
    refresh: 'text-white/80 hover:bg-white/15 hover:text-white',
    connected: 'text-white',
    env: 'text-white/75',
    ring: 'focus-visible:ring-white/80',
  },
  paypal: {
    card: 'bg-[#003087] text-white border-transparent shadow-[0_8px_24px_-12px_rgba(0,48,135,0.7)] dark:bg-[#0070BA]',
    plus: 'bg-[#FFC439] text-[#003087]',
    refresh: 'text-white/80 hover:bg-white/15 hover:text-white',
    connected: 'text-[#FFC439]',
    env: 'text-white/75',
    ring: 'focus-visible:ring-[#FFC439]/80',
  },
  card: {
    card: 'bg-[#1A1F71] text-white border-transparent shadow-[0_8px_24px_-12px_rgba(26,31,113,0.7)] dark:bg-[#12164F]',
    plus: 'bg-white text-[#1A1F71]',
    refresh: 'text-white/80 hover:bg-white/15 hover:text-white',
    connected: 'text-white',
    env: 'text-white/75',
    ring: 'focus-visible:ring-white/80',
  },
} as const

type ProcessorBrand = keyof typeof PROCESSOR_BRAND

function ProcessorCard({
  brand,
  name,
  purpose,
  highlighted = false,
  connected,
  environment,
  detail,
  footerLabel = 'connected',
  error,
  pendingUrl,
  connecting,
  refreshing = false,
  showRefresh = true,
  onConnect,
  onRefresh,
  onOpen,
}: {
  brand: ProcessorBrand
  name: string
  purpose?: string
  highlighted?: boolean
  connected: boolean
  environment?: string
  detail?: string
  footerLabel?: string
  error?: string
  pendingUrl?: string
  connecting: boolean
  refreshing?: boolean
  showRefresh?: boolean
  onConnect: () => void
  onRefresh?: () => void
  onOpen: () => void
}) {
  const envLabel =
    environment === 'sandbox' ? (isDevBuild ? 'sandbox' : 'test mode') : environment && environment !== 'production' ? environment : ''
  const tones = PROCESSOR_BRAND[brand]
  const subtitle = detail ?? envLabel

  if (!connected) {
    return (
      <div className="w-[min(100%,13rem)] space-y-2">
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className={cx(
            'relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left',
            tones.card,
            'transition-[transform,box-shadow] duration-200 hover:scale-[1.02]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            tones.ring,
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          <BrandMark
            brand={brand}
            className="pointer-events-none absolute inset-0 m-auto block size-[6.5rem] text-current opacity-[0.18]"
          />
          <span className="relative z-10">
            <span className="font-display text-xl font-bold">{name}</span>
            {purpose ? (
              <span className={cx('mt-1 block text-[10px] font-bold uppercase tracking-widest', tones.env)}>{purpose}</span>
            ) : null}
          </span>
          <span className="relative z-10 flex justify-end">
            <span className={cx('grid size-10 place-items-center rounded-full', tones.plus)}>
              {connecting ? (
                <RefreshCw aria-hidden className="size-5 animate-spin" />
              ) : (
                <Plus aria-hidden className="size-5" />
              )}
            </span>
          </span>
          <span className="sr-only">{connecting ? `Connecting ${name}` : `Add ${name}`}</span>
        </button>
        {pendingUrl ? (
          <p className="text-sm leading-6 text-fg-muted">
            Finish authorization in the {name} tab. If it did not open,{' '}
            <a
              href={pendingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              continue to {name}
            </a>
            , then return here.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="w-[min(100%,13rem)] space-y-2">
      <div
        className={cx(
          'relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border p-4',
          tones.card,
          highlighted && 'ring-2 ring-white ring-offset-2 ring-offset-bg',
        )}
      >
        <BrandMark
          brand={brand}
          className="pointer-events-none absolute inset-0 m-auto block size-[6.5rem] text-current opacity-[0.18]"
        />
        <button
          type="button"
          onClick={onOpen}
          className={cx(
            'absolute inset-0 z-10 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            tones.ring,
          )}
        >
          <span className="sr-only">Manage {name}</span>
        </button>
        <div className="relative z-20 flex items-start justify-between gap-3">
          <div className="pointer-events-none">
            <p className="font-display text-xl font-bold">{name}</p>
            {purpose ? (
              <p className={cx('mt-1 text-[10px] font-bold uppercase tracking-widest', tones.env)}>{purpose}</p>
            ) : null}
            {subtitle ? <p className={cx('mt-1 text-xs font-medium uppercase tracking-wide', tones.env)}>{subtitle}</p> : null}
          </div>
          {showRefresh && onRefresh ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRefresh()
              }}
              disabled={refreshing}
              className={cx('rounded-btn p-1.5 disabled:opacity-50', tones.refresh)}
              aria-label={`Refresh ${name} status`}
            >
              <RefreshCw aria-hidden className={cx('size-5', refreshing && 'animate-spin')} />
            </button>
          ) : null}
        </div>
        {footerLabel ? (
          <p className={cx('pointer-events-none relative z-20 text-sm font-semibold lowercase tracking-wide', tones.connected)}>
            {footerLabel}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ChargeSourceButton({
  brand,
  name,
  detail,
  selected,
  disabled,
  unavailableLabel,
  onSelect,
  onEdit,
}: {
  brand: ProcessorBrand
  name: string
  detail?: string
  selected: boolean
  disabled?: boolean
  unavailableLabel?: string
  onSelect: () => void
  onEdit?: () => void
}) {
  const tones = PROCESSOR_BRAND[brand]
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onSelect}
        className={cx(
          'relative flex aspect-square w-[6.75rem] flex-col justify-between overflow-hidden rounded-2xl border p-3 text-left transition-transform',
          tones.card,
          selected
            ? 'ring-2 ring-offset-2 ring-offset-bg ring-white scale-[1.03]'
            : 'opacity-80 hover:opacity-100 hover:scale-[1.02]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          tones.ring,
          disabled && 'pointer-events-none opacity-35 grayscale',
        )}
      >
        <BrandMark
          brand={brand}
          className="pointer-events-none absolute inset-0 m-auto block size-14 text-current opacity-[0.2]"
        />
        <span className="relative z-10 font-display text-sm font-bold">{name}</span>
        <span className={cx('relative z-10 text-[11px] font-medium leading-tight', tones.env)}>
          {disabled ? unavailableLabel ?? 'Not connected' : detail ?? 'Ready'}
        </span>
      </button>
      {onEdit ? (
        <button
          type="button"
          aria-label="Replace the debit card on file"
          onClick={onEdit}
          className="absolute right-1.5 top-1.5 z-20 grid size-7 place-items-center rounded-full bg-white text-[#1A1F71] shadow-sm hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

function UsageProgress({
  sub,
  salesSquare,
  salesPaypal,
  feeLabel,
  salesSyncNote,
  nightlySyncNote,
  syncing,
  onEditSalesSource,
  onEditFeeSource,
  onSyncSales,
  onSyncNightly,
}: {
  sub: StoreSubscriptionStatus
  salesSquare: boolean
  salesPaypal: boolean
  feeLabel: string
  salesSyncNote: string | null
  nightlySyncNote: string | null
  syncing: boolean
  onEditSalesSource: () => void
  onEditFeeSource: () => void
  onSyncSales: () => void
  onSyncNightly: () => void
}) {
  const cap = Math.max(0, sub.capCents)
  const paid = Math.min(Math.max(0, sub.platformFeesPaidCents), cap || sub.platformFeesPaidCents)
  const percent = cap > 0 ? Math.min(100, sub.progressPercent) : sub.capReached ? 100 : 0
  const salesBrands: ProcessorBrand[] = [
    ...(salesSquare ? (['square'] as const) : []),
    ...(salesPaypal ? (['paypal'] as const) : []),
  ]
  const salesTitle = salesSourceLabel(salesSquare, salesPaypal)
  const salesConnected = salesSquare || salesPaypal
  const vaultBrand = feeProcessorBrand(sub)
  const salesMatchesVault =
    Boolean(sub.paymentConfigured)
    && ((vaultBrand === 'paypal' && salesPaypal && !salesSquare)
      || (vaultBrand !== 'paypal' && salesSquare && !salesPaypal))
  const syncTargetName = vaultBrand === 'paypal' ? 'PayPal' : 'Square'
  const chargesNightlyFees = sub.billingModel === 'usage' && !sub.capReached

  return (
    <div className="border border-border bg-surface px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm font-semibold text-fg">Progress to {formatPrice(cap || 45000)}</p>
        <p className="text-sm tabular-nums text-fg-muted">
          {formatPrice(paid)} of {formatPrice(cap || 45000)} · {percent.toFixed(percent % 1 === 0 ? 0 : 1)}%
        </p>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg ring-1 ring-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Platform fee cap progress"
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <dl className="mt-4 grid gap-x-3 gap-y-2 text-sm sm:grid-cols-2 sm:items-start">
        <div className="flex min-h-0 flex-col">
          <dt className="flex min-h-[2.5rem] items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg-muted">
            Store sales checkout
            <HelpTip label={SALES_CHECKOUT_METHODS_TIP} />
          </dt>
          <dd className="mt-2 space-y-2">
            <SourceEditorRow
              brands={salesBrands}
              title={salesTitle}
              subtitle={salesConnected ? 'Connected for store sales' : 'Not connected'}
              actionLabel={salesConnected ? 'Change' : 'Add'}
              ariaLabel={salesConnected ? 'Change store sales checkout' : 'Add store sales checkout'}
              onEdit={onEditSalesSource}
            />
            <SyncAllPayments
              aligned={salesMatchesVault}
              alignedMessage="Nightly payment already matches this checkout processor."
              hint="Nightly payment will vault a matching debit card or PayPal for platform fees (seller Connect stays separate)."
              note={salesSyncNote}
              syncing={syncing}
              onSync={onSyncSales}
            />
          </dd>
        </div>
        <div className="flex min-h-0 flex-col">
          <dt className="min-h-[2.5rem] text-xs font-bold uppercase tracking-wide text-fg-muted">
            {chargesNightlyFees ? 'Debit card charged for nightly fees' : 'Debit card on file'}
          </dt>
          <dd className="mt-2 space-y-2">
            <SourceEditorRow
              brands={[vaultBrand]}
              title={feeLabel}
              subtitle={
                chargesNightlyFees
                  ? sub.paymentConfigured
                    ? 'Charged for the nightly 10%'
                    : 'Add a debit card for nightly fees'
                  : sub.paymentConfigured
                    ? 'On file for platform billing'
                    : 'Add a debit card for platform billing'
              }
              actionLabel={sub.paymentConfigured ? 'Change' : 'Add'}
              ariaLabel={
                chargesNightlyFees
                  ? sub.paymentConfigured
                    ? 'Change debit card charged for nightly fees'
                    : 'Add a debit card for nightly fees'
                  : sub.paymentConfigured
                    ? 'Change debit card on file'
                    : 'Add a debit card for platform billing'
              }
              onEdit={onEditFeeSource}
            />
            {sub.paymentConfigured ? (
              <SyncAllPayments
                aligned={salesMatchesVault}
                alignedMessage={`Store sales checkout already uses ${syncTargetName}.`}
                hint={
                  chargesNightlyFees
                    ? `Connect ${syncTargetName} for store sales. Nightly fees keep charging ${feeLabel}.`
                    : `Connect ${syncTargetName} for store sales. Platform billing keeps using ${feeLabel}.`
                }
                note={nightlySyncNote}
                syncing={syncing}
                onSync={onSyncNightly}
              />
            ) : null}
          </dd>
        </div>
      </dl>
      {sub.billingModel === 'usage' && !sub.capReached ? (
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          {formatFeePercent(sub.todayFeePercent)} of today&apos;s store sales
          {sub.todayGrossCents > 0 ? ` (${formatPrice(sub.todayGrossCents)})` : ''}
          {' '}will be charged tonight to {feeLabel}
          {sub.todayFeeCents > 0 ? ` (${formatPrice(sub.todayFeeCents)})` : sub.todayGrossCents < 1 ? ' once you make a sale' : ''}
          {sub.currentPeriodEnd && sub.willAutoChargeRemainder
            ? `. Remaining balance auto-charges on ${formatPeriodEnd(sub.currentPeriodEnd)}.`
            : '.'}
        </p>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">
          {sub.billingModel === 'flat'
            ? `This month is prepaid. Next ${formatPrice(sub.capCents || 45000)} renews${sub.currentPeriodEnd ? ` on ${formatPeriodEnd(sub.currentPeriodEnd)}` : ''}.`
            : 'This month’s platform fee is paid. Nightly sales fees resume next month.'}
        </p>
      )}
    </div>
  )
}

function SourceEditorRow({
  brands,
  title,
  subtitle,
  actionLabel,
  ariaLabel,
  onEdit,
}: {
  brands: ProcessorBrand[]
  title: string
  subtitle: string
  actionLabel: string
  ariaLabel: string
  onEdit: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-2.5 py-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        {brands.length > 0 ? (
          <span className="flex items-center">
            {brands.map((brand, index) => (
              <span key={brand} className={index > 0 ? '-ml-2' : undefined}>
                <CenteredBrandIcon brand={brand} />
              </span>
            ))}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block truncate font-medium text-fg">{title}</span>
          <span className="text-xs text-fg-muted">{subtitle}</span>
        </span>
      </button>
      <Button variant="secondary" size="sm" className="shrink-0 px-2.5" onClick={onEdit}>
        {actionLabel}
      </Button>
    </div>
  )
}

function CenteredBrandIcon({ brand }: { brand: ProcessorBrand }) {
  return (
    <span
      className={cx(
        'relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg',
        PROCESSOR_BRAND[brand].card,
      )}
    >
      <BrandMark brand={brand} className="size-6" />
    </span>
  )
}

function HelpTip({ label }: { label: string }) {
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="rounded-full p-0.5 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 peer"
        aria-label={label}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-xs font-medium normal-case tracking-normal leading-5 text-fg opacity-0 shadow-lg peer-hover:opacity-100 peer-focus:opacity-100 peer-focus-visible:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

function SyncAllPayments({
  aligned,
  alignedMessage,
  hint,
  note,
  syncing,
  disabled,
  disabledReason,
  onSync,
}: {
  aligned: boolean
  alignedMessage: string
  hint: string
  note: string | null
  syncing: boolean
  disabled?: boolean
  disabledReason?: string
  onSync: () => void
}) {
  const button = (
    <Button variant="secondary" size="sm" loading={syncing} disabled={disabled} onClick={onSync}>
      Sync all payments to this account
    </Button>
  )
  return (
    <div className="space-y-2">
      {aligned ? (
        <p className="text-xs leading-5 text-fg-muted">{alignedMessage}</p>
      ) : (
        <>
          {disabled && disabledReason ? (
            <span className="inline-flex" title={disabledReason}>
              {button}
            </span>
          ) : (
            button
          )}
          <p className="text-xs leading-5 text-fg-muted">{hint}</p>
        </>
      )}
      {note ? (
        <p className="text-sm font-medium text-fg" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}

function SalesAccountRow({
  brand,
  name,
  connected,
  connecting,
  onConnect,
  onManage,
}: {
  brand: ProcessorBrand
  name: string
  connected: boolean
  connecting: boolean
  onConnect: () => void
  onManage: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg px-3 py-3">
      <CenteredBrandIcon brand={brand} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{name}</p>
        <p className="text-xs text-fg-muted">{connected ? 'Connected for store sales' : 'Not connected'}</p>
      </div>
      {connected ? (
        <Button variant="secondary" size="sm" onClick={onManage}>
          Manage
        </Button>
      ) : (
        <Button size="sm" loading={connecting} onClick={onConnect}>
          Connect
        </Button>
      )}
    </div>
  )
}

function DisabledSalesCardRow() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-bg/60 px-3 py-3 opacity-60"
      title={SALES_CHECKOUT_METHODS_TIP}
    >
      <CenteredBrandIcon brand="card" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">Debit card</p>
        <p className="text-xs text-fg-muted">Nightly fees only, not store sales checkout</p>
      </div>
      <HelpTip label={SALES_CHECKOUT_METHODS_TIP} />
    </div>
  )
}

function NightlyVaultFields({
  brand,
  sub,
  email,
  saving,
  error,
  saved,
  onSquareToken,
  onPaypalApproved,
  createPaypalOrder,
}: {
  brand: ProcessorBrand
  sub: StoreSubscriptionStatus
  email: string
  saving: boolean
  error: string
  saved: boolean
  onSquareToken: (payment: TokenizedPayment) => void
  onPaypalApproved: (orderId: string) => Promise<void>
  createPaypalOrder: () => Promise<string>
}) {
  const heading =
    brand === 'paypal'
      ? 'Save PayPal for nightly payment'
      : brand === 'square'
        ? 'Enter debit card via Square'
        : 'Replace the debit card we charge'
  return (
    <div className="space-y-3 rounded-xl border border-border bg-bg px-3 py-3">
      <p className="text-sm font-medium text-fg">{heading}</p>
      {brand === 'paypal' ? (
        sub.paypal?.enabled ? (
          <PaypalButtons
            clientId={sub.paypal.clientId}
            environment={sub.paypal.environment}
            currency={sub.paypal.currency}
            disabled={saving}
            createOrder={createPaypalOrder}
            onApproved={onPaypalApproved}
          />
        ) : (
          <p className="text-sm text-fg-muted">PayPal is not enabled for platform billing on this store.</p>
        )
      ) : sub.mode === 'square' ? (
        <SquarePaymentPanel
          applicationId={sub.applicationId}
          locationId={sub.locationId}
          environment={sub.environment}
          priceCents={0}
          currency={sub.currency}
          countryCode={sub.countryCode}
          billingEmail={email}
          confirmLabel="Save debit card"
          layout="vault"
          onTokenized={onSquareToken}
        />
      ) : isDevBuild ? (
        <Button
          variant="secondary"
          loading={saving}
          onClick={() =>
            onSquareToken({
              methodType: 'card',
              token: `mock-card-${Date.now().toString(36)}`,
              last4: '4242',
              verificationToken: '',
            })
          }
        >
          <CreditCard aria-hidden className="size-4" />
          Simulate debit card (dev only)
        </Button>
      ) : (
        <p className="text-sm text-fg-muted">
          Platform billing is not configured yet. Contact support to update your subscription payment method.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success-700">
          <CheckCircle2 aria-hidden className="size-4" />
          Payment method updated.
        </p>
      ) : null}
    </div>
  )
}

function BrandMark({ brand, className }: { brand: ProcessorBrand; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {brand === 'square' ? (
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.2 2.4h15.6A1.8 1.8 0 0 1 21.6 4.2v15.6a1.8 1.8 0 0 1-1.8 1.8H4.2A1.8 1.8 0 0 1 2.4 19.8V4.2A1.8 1.8 0 0 1 4.2 2.4Zm2.85 4.05h9.9c.746 0 1.35.604 1.35 1.35v9.9c0 .746-.604 1.35-1.35 1.35h-9.9a1.35 1.35 0 0 1-1.35-1.35v-9.9c0-.746.604-1.35 1.35-1.35Z"
        />
      ) : brand === 'paypal' ? (
        <g transform="translate(1.2 0.4)">
          <path
            opacity="0.55"
            d="M8.35 4.2h5.05c2.55 0 4.1 1.35 4.1 3.55 0 2.5-1.8 4.05-4.4 4.05h-2.15L9.7 19.8H6.85L8.35 4.2Z"
          />
          <path d="M6.2 3h6.15c2.45 0 4.15.55 5.2 1.75.85.95 1.15 2.25.9 3.9-.45 3.35-2.85 5.5-6.45 5.5H9.15L7.85 21H4.95L6.2 3Z" />
        </g>
      ) : (
        <>
          <path d="M3.5 7.25A2.25 2.25 0 0 1 5.75 5h12.5A2.25 2.25 0 0 1 20.5 7.25v9.5A2.25 2.25 0 0 1 18.25 19H5.75A2.25 2.25 0 0 1 3.5 16.75v-9.5ZM5.75 6.5a.75.75 0 0 0-.75.75V9h14V7.25a.75.75 0 0 0-.75-.75H5.75Z" />
          <rect x="5.5" y="12.25" width="4.25" height="1.5" rx="0.4" />
        </>
      )}
    </svg>
  )
}

function salesSourceLabel(squareConnected: boolean, paypalConnected: boolean): string {
  if (squareConnected && paypalConnected) return 'Square and PayPal'
  if (squareConnected) return 'Square'
  if (paypalConnected) return 'PayPal'
  return 'No checkout connected yet'
}

function feeProcessorBrand(sub: StoreSubscriptionStatus): ProcessorBrand {
  if (sub.billingProvider === 'paypal' || sub.paymentMethodType === 'paypal') return 'paypal'
  return 'card'
}

function feeSourceLabel(sub: StoreSubscriptionStatus): string {
  if (!sub.paymentConfigured) return 'No debit card on file yet'
  if (sub.billingProvider === 'paypal' || sub.paymentMethodType === 'paypal') {
    return sub.paymentLast4 ? `PayPal •••• ${sub.paymentLast4}` : 'PayPal on file'
  }
  if (sub.paymentLast4) return `Debit card •••• ${sub.paymentLast4}`
  if (sub.paymentMethodType && sub.paymentMethodType !== 'card') {
    return METHOD_LABELS[sub.paymentMethodType] ?? 'Debit card on file'
  }
  return 'Debit card on file'
}

function pendingSalesConnectKey(slug: string): string {
  return `lgs.payments.pendingSalesConnect.${slug}`
}

function readPendingSalesConnect(slug: string): 'square' | 'paypal' | null {
  try {
    const raw = window.sessionStorage.getItem(pendingSalesConnectKey(slug))
    if (raw === 'square' || raw === 'paypal') return raw
  } catch {
    /* ignore */
  }
  return null
}

function writePendingSalesConnect(slug: string, value: 'square' | 'paypal' | null): void {
  try {
    if (!value) window.sessionStorage.removeItem(pendingSalesConnectKey(slug))
    else window.sessionStorage.setItem(pendingSalesConnectKey(slug), value)
  } catch {
    /* ignore */
  }
}

function planSummary(sub: StoreSubscriptionStatus): string {
  if (sub.billingModel === 'usage') {
    return `${sub.planName ?? 'Pay as you sell'} · ${formatFeePercent(sub.todayFeePercent || 10)} of daily sales toward ${formatPrice(sub.capCents)}/mo`
  }
  if (sub.billingModel === 'flat') {
    return `${sub.planName ?? 'Pay in full'} · ${formatPrice(sub.capCents || sub.priceCents)}/mo`
  }
  if (sub.priceCents <= 0) {
    return `${sub.planName ?? sub.planKey ?? 'Plan'} · Free`
  }
  return `${sub.planName ?? sub.planKey ?? 'Plan'} · ${formatPrice(sub.priceCents)}/mo`
}

function formatPeriodEnd(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

function formatFeePercent(value: number): string {
  const n = Number.isFinite(value) ? value : 10
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`
}

function ManageProcessorModal({
  open,
  name,
  account,
  connecting,
  disconnecting,
  onClose,
  onReconnect,
  onDisconnect,
}: {
  open: boolean
  name: string
  account: StorePaymentAccount | null | undefined
  connecting: boolean
  disconnecting: boolean
  onClose: () => void
  onReconnect: () => void
  onDisconnect: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      footer={
        <>
          <Button variant="secondary" loading={connecting} onClick={onReconnect}>
            <ExternalLink aria-hidden className="size-4" />
            Reconnect
          </Button>
          <Button variant="danger" loading={disconnecting} onClick={onDisconnect}>
            <Unplug aria-hidden className="size-4" />
            Disconnect
          </Button>
        </>
      }
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <PaymentFact label="Status" value={account?.status ?? 'connected'} />
        <PaymentFact label="Merchant" value={account?.merchantId ?? '-'} />
        <PaymentFact label="Connected" value={formatDate(account?.connectedAt)} />
        <PaymentFact label="Token expires" value={formatDate(account?.tokenExpiresAt)} />
        <PaymentFact label="Scopes" value={account?.scopes?.join(', ') || '-'} wide />
      </dl>
      {account?.lastError ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger-700">
          {account.lastError}
        </p>
      ) : null}
    </Modal>
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
