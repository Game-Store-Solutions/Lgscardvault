import { useEffect, useRef, useState } from 'react'
import type { ApplePay, Card, GooglePay, TokenResult } from '@square/web-sdk'
import { CreditCard, Loader2 } from 'lucide-react'
import type { PaymentMethodType } from '../../api/types'
import { Button } from '../ui'
import { isDevBuild } from '../../lib/runtimeEnv'
import { useDarkMode } from '../../hooks/useDarkMode'
import { useSquarePayments } from './useSquarePayments'
import { squareCardStyle } from './squareCardStyle'

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

function PaymentDivider({ label = 'Or pay with card' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium text-fg-muted">
      <span className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
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
  paymentRequestLabel = 'Total',
  layout = 'checkout',
  saveOnly = false,
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
  paymentRequestLabel?: string
  /** checkout = wallets first (cart); vault = card form only (admin subscription). */
  layout?: 'checkout' | 'vault'
  /** Save card/wallet without charging — enables express checkout at $0.01 for the wallet SDK. */
  saveOnly?: boolean
  onTokenized: (payment: TokenizedPayment) => void
}) {
  const { payments, loading, error: loadError } = useSquarePayments(applicationId, locationId, environment)
  const darkMode = useDarkMode()

  const cardRef = useRef<HTMLDivElement>(null)
  const googlePayRef = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [googlePay, setGooglePay] = useState<GooglePay | null>(null)
  const [applePay, setApplePay] = useState<ApplePay | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [walletsChecked, setWalletsChecked] = useState(false)

  const walletsEnabled = layout === 'checkout' && (priceCents > 0 || saveOnly)
  const walletDisplayCents = saveOnly && priceCents <= 0 ? 1 : priceCents
  const amount = (walletDisplayCents / 100).toFixed(2)
  const vaultIntent = saveOnly || priceCents <= 0
  const showExpress = walletsEnabled && (googlePay || applePay)
  const showWalletDivider = showExpress

  useEffect(() => {
    if (!payments) return

    let cancelled = false
    let instance: Card | null = null

    void payments
      .card({ style: squareCardStyle(darkMode) })
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
  }, [payments, darkMode])

  useEffect(() => {
    if (!payments || !walletsEnabled) return

    setWalletsChecked(false)
    let cancelled = false
    let google: GooglePay | null = null
    let apple: ApplePay | null = null

    let request
    try {
      request = payments.paymentRequest({
        countryCode,
        currencyCode: currency,
        total: { amount, label: paymentRequestLabel },
      })
    } catch {
      if (!cancelled) setWalletsChecked(true)
      return
    }

    void payments
      .googlePay(request)
      .then(async (created) => {
        google = created
        if (cancelled || !googlePayRef.current) return
        await created.attach(googlePayRef.current)
        if (!cancelled) setGooglePay(created)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setWalletsChecked(true)
      })

    void payments
      .applePay(request)
      .then((created) => {
        apple = created
        if (!cancelled) setApplePay(created)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setWalletsChecked(true)
      })

    return () => {
      cancelled = true
      setGooglePay(null)
      setApplePay(null)
      if (google) void google.destroy()
      if (apple) void apple.destroy()
    }
  }, [payments, walletsEnabled, amount, currency, countryCode, paymentRequestLabel])

  async function verify(token: string): Promise<string> {
    if (!payments) return ''

    const billingContact = { email: billingEmail || undefined, countryCode }
    try {
      const result = await payments.verifyBuyer(
        token,
        vaultIntent
          ? { intent: 'STORE', billingContact }
          : { amount, currencyCode: currency, intent: 'CHARGE_AND_STORE', billingContact },
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

  const sandboxBanner =
    environment === 'sandbox' ? (
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
    ) : null

  const expressCheckout =
    walletsEnabled && layout === 'checkout' ? (
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Express checkout</p>
        <div className="flex flex-col gap-2">
          {applePay && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(() => applePay.tokenize(), 'apple_pay')}
              className="flex h-12 w-full items-center justify-center rounded-btn bg-black px-4 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Apple&nbsp;Pay
            </button>
          )}
          <div
            ref={googlePayRef}
            className={googlePay ? 'min-h-12 w-full [&>button]:!w-full' : 'hidden'}
            onClick={() => {
              if (googlePay && !busy) void submit(() => googlePay.tokenize(), 'google_pay')
            }}
          />
        </div>
        {walletsChecked && !googlePay && !applePay && (
          <p className="text-xs leading-5 text-fg-muted">Wallets aren&apos;t available in this browser — use your card below.</p>
        )}
      </div>
    ) : null

  const cardBlock = (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-fg">{layout === 'checkout' ? 'Card information' : 'Payment method'}</p>
      <div className="relative min-h-[7.5rem] rounded-btn border border-border bg-bg px-2 py-2">
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading secure payment form…
          </p>
        )}
        <div ref={cardRef} className={`sq-card-host min-h-[6.5rem] ${loading ? 'invisible' : ''}`} />
      </div>
      <Button className="w-full" size="lg" loading={busy} disabled={!card} onClick={() => void submit(() => card!.tokenize(), 'card')}>
        <CreditCard aria-hidden className="size-4" />
        {confirmLabel}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      {sandboxBanner}
      {saveOnly && (
        <p className="text-xs leading-5 text-fg-muted">
          Your payment method is saved securely with this store&apos;s Square account. You are not charged now.
        </p>
      )}

      {layout === 'checkout' ? (
        <>
          {expressCheckout}
          {showWalletDivider && <PaymentDivider />}
          {cardBlock}
        </>
      ) : (
        <>
          {cardBlock}
          {expressCheckout}
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
