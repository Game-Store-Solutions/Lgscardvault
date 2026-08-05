import { useEffect, useRef, useState } from 'react'
import type { ApplePay, Card, GooglePay, TokenResult } from '@square/web-sdk'
import { CreditCard, Loader2 } from 'lucide-react'
import type { PaymentMethodType } from '../../api/types'
import { Button } from '../ui'
import { isDevBuild } from '../../lib/runtimeEnv'
import { useSquarePayments } from './useSquarePayments'

export type TokenizedPayment = {
  methodType: PaymentMethodType
  token: string
  last4: string
  verificationToken: string
}

/** Square reports the wallet it tokenized; map it onto our stored method type. */
const METHOD_BY_SDK: Record<string, PaymentMethodType> = {
  Card: 'card',
  'Apple Pay': 'apple_pay',
  'Google Pay': 'google_pay',
}

export function SquarePaymentPanel({
  applicationId,
  locationId,
  environment,
  priceCents,
  currency,
  countryCode,
  billingEmail = '',
  confirmLabel = 'Save payment method',
  onTokenized,
}: {
  applicationId: string
  locationId: string
  environment: string
  priceCents: number
  currency: string
  countryCode: string
  billingEmail?: string
  confirmLabel?: string
  onTokenized: (payment: TokenizedPayment) => void
}) {
  const { payments, loading, error: loadError } = useSquarePayments(applicationId, locationId)

  const cardRef = useRef<HTMLDivElement>(null)
  const googlePayRef = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [googlePay, setGooglePay] = useState<GooglePay | null>(null)
  const [applePay, setApplePay] = useState<ApplePay | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Wallets need a non-zero total, so they only appear when money moves.
  // Updating a stored card is a card-only flow.
  const walletsEnabled = priceCents > 0
  const amount = (priceCents / 100).toFixed(2)

  useEffect(() => {
    if (!payments) return

    let cancelled = false
    let instance: Card | null = null

    void payments
      .card()
      .then(async (created) => {
        instance = created
        if (cancelled || !cardRef.current) return
        await created.attach(cardRef.current)
        if (!cancelled) setCard(created)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the card form.')
      })

    return () => {
      cancelled = true
      setCard(null)
      if (instance) void instance.destroy()
    }
  }, [payments])

  useEffect(() => {
    if (!payments || !walletsEnabled) return

    let cancelled = false
    let google: GooglePay | null = null
    let apple: ApplePay | null = null

    let request
    try {
      request = payments.paymentRequest({
        countryCode,
        currencyCode: currency,
        total: { amount, label: 'Subscription' },
      })
    } catch {
      return
    }

    // Either wallet can legitimately be unavailable (unsupported browser, no
    // verified domain, merchant not enabled) — hide it rather than surfacing
    // an error the owner cannot act on.
    void payments
      .googlePay(request)
      .then(async (created) => {
        google = created
        if (cancelled || !googlePayRef.current) return
        await created.attach(googlePayRef.current)
        if (!cancelled) setGooglePay(created)
      })
      .catch(() => undefined)

    void payments
      .applePay(request)
      .then((created) => {
        apple = created
        if (!cancelled) setApplePay(created)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      setGooglePay(null)
      setApplePay(null)
      if (google) void google.destroy()
      if (apple) void apple.destroy()
    }
  }, [payments, walletsEnabled, amount, currency, countryCode])

  /**
   * Strong Customer Authentication. Optional in the US, required in the UK/EU,
   * so a failure here must not block signup — Square declines the payment
   * later if verification was actually mandatory.
   */
  async function verify(token: string): Promise<string> {
    if (!payments) return ''

    const billingContact = { email: billingEmail || undefined, countryCode }
    try {
      const result = await payments.verifyBuyer(
        token,
        priceCents > 0
          ? { amount, currencyCode: currency, intent: 'CHARGE_AND_STORE', billingContact }
          : { intent: 'STORE', billingContact },
      )
      return result?.token ?? ''
    } catch {
      return ''
    }
  }

  async function submit(tokenize: () => Promise<TokenResult>, fallback: PaymentMethodType) {
    setError('')
    setBusy(true)
    try {
      const result = await tokenize()

      if (result.status !== 'OK') {
        // The buyer closing a wallet sheet is not an error worth shouting about.
        if ('Cancel' === result.status || 'Abort' === result.status) return
        const detail = 'errors' in result ? result.errors.map((e) => e.message).join(' ') : ''
        throw new Error(detail || 'Your payment details could not be verified.')
      }

      onTokenized({
        methodType: METHOD_BY_SDK[result.details?.method ?? ''] ?? fallback,
        token: result.token,
        last4: result.details?.card?.last4 ?? '',
        verificationToken: await verify(result.token),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your payment details could not be verified.')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
        {loadError}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {environment === 'sandbox' && (
        <p className="rounded-btn bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
          {isDevBuild ? (
            <>
              Test mode — use card <span className="font-mono">4111 1111 1111 1111</span>, any future expiry, CVV{' '}
              <span className="font-mono">111</span>, postal <span className="font-mono">94103</span>.
            </>
          ) : (
            <>Test mode — cards are not charged. Use Square sandbox test card numbers.</>
          )}
        </p>
      )}

      <div className="relative min-h-[110px] rounded-card border border-border bg-surface p-4">
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading secure payment form…
          </p>
        )}
        <div ref={cardRef} className={loading ? 'invisible' : undefined} />
      </div>

      <Button loading={busy} disabled={!card} onClick={() => void submit(() => card!.tokenize(), 'card')}>
        <CreditCard aria-hidden className="size-4" />
        {confirmLabel}
      </Button>

      {walletsEnabled && (googlePay || applePay) && (
        <>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-fg-muted">
            <span className="h-px flex-1 bg-border" />
            or pay with
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div
              ref={googlePayRef}
              hidden={!googlePay}
              onClick={() => {
                if (googlePay && !busy) void submit(() => googlePay.tokenize(), 'google_pay')
              }}
            />

            {applePay && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit(() => applePay.tokenize(), 'apple_pay')}
                className="flex h-11 items-center justify-center rounded-card bg-black px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                 Pay
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
}
