import { useCallback, useEffect, useRef, useState } from 'react'
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

export function PaymentDivider({ label = 'Or pay with card' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-medium text-fg-muted">
      <span className="h-px flex-1 bg-border/70" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  )
}

/** Primary pay CTA — strongest visual weight on checkout surfaces. */
export const checkoutPayButtonClass =
  '!h-12 w-full text-base font-extrabold shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/35 active:scale-[0.99]'

export type SquareCardPayAction = {
  payWithCard: () => void
  busy: boolean
  cardReady: boolean
  label: string
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
  payButtonPlacement = 'inline',
  showCardForm = true,
  onPayActionChange,
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
  /** When external, card pay button is omitted — parent renders it (e.g. below an accordion). */
  payButtonPlacement?: 'inline' | 'external'
  /** Cart checkout hides the card form and uses pay-in-store instead. */
  showCardForm?: boolean
  onPayActionChange?: (action: SquareCardPayAction | null) => void
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
  const showWalletDivider = showExpress && showCardForm

  /** Square Card fails if attach runs while the host is display:none or zero-size. */
  async function attachCardWhenReady(created: Card): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const host = cardRef.current
      if (!host) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve())
        })
        continue
      }
      const visible = host.offsetWidth > 0 && host.offsetHeight > 0
      if (visible) {
        await created.attach(host)
        return
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
    throw new Error('Payment form is not visible yet. Expand the payment section and try again.')
  }

  useEffect(() => {
    if (!payments || !showCardForm) return

    let cancelled = false
    let instance: Card | null = null

    void payments
      .card({ style: squareCardStyle(darkMode) })
      .then(async (created) => {
        instance = created
        if (cancelled) return
        await attachCardWhenReady(created)
        if (!cancelled) setCard(created)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the card form.')
        }
      })

    return () => {
      cancelled = true
      setCard(null)
      if (instance) void instance.destroy()
    }
  }, [payments, darkMode, showCardForm])

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

  const submit = useCallback(
    async (tokenize: () => Promise<TokenResult>, fallback: PaymentMethodType) => {
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
    },
    [onTokenized, payments, amount, currency, billingEmail, countryCode, vaultIntent],
  )

  const payWithCard = useCallback(() => {
    if (!card) return
    void submit(() => card.tokenize(), 'card')
  }, [card, submit])

  useEffect(() => {
    if (payButtonPlacement !== 'external') {
      onPayActionChange?.(null)
      return
    }
    onPayActionChange?.({
      payWithCard,
      busy,
      cardReady: Boolean(card),
      label: confirmLabel,
    })
  }, [payButtonPlacement, onPayActionChange, payWithCard, busy, card, confirmLabel])

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
        {showCardForm && isDevBuild ? (
          <>
            Test mode. Use card <span className="font-mono">4111 1111 1111 1111</span>, any future expiry, CVV{' '}
            <span className="font-mono">111</span>, postal <span className="font-mono">94103</span>.
          </>
        ) : (
          <>Test mode. Square wallets are not charged.</>
        )}
      </p>
    ) : null

  const walletCount = Number(Boolean(applePay)) + Number(Boolean(googlePay))
  const expressCheckout =
    walletsEnabled && layout === 'checkout' ? (
      <div className="mt-2 space-y-3 rounded-xl bg-bg/90 px-4 py-4 dark:bg-bg/50">
        <p className="text-sm font-bold text-fg">Express checkout</p>
        <div className={walletCount > 1 ? 'grid grid-cols-2 items-stretch gap-2.5' : 'flex flex-col gap-2.5'}>
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
            className={googlePay ? 'flex min-h-12 w-full items-stretch [&>button]:!h-12 [&>button]:!w-full' : 'hidden'}
            onClick={() => {
              if (googlePay && !busy) void submit(() => googlePay.tokenize(), 'google_pay')
            }}
          />
        </div>
        {walletsChecked && !googlePay && !applePay && (
          <p className="text-xs leading-5 text-fg-muted">
            {showCardForm
              ? 'Wallets aren\'t available in this browser. Use your card below.'
              : 'Apple Pay and Google Pay aren\'t available in this browser. Reserve and pay in store, or scan the Square QR after checkout.'}
          </p>
        )}
      </div>
    ) : null

  const cardBlock = (
    <div className="space-y-3 pt-1">
      <p className="text-sm font-semibold text-fg">{layout === 'checkout' ? 'Card information' : 'Payment method'}</p>
      <div className="relative min-h-[7.75rem] rounded-xl bg-bg/60 px-2 py-3 dark:bg-bg/40">
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading secure payment form…
          </p>
        )}
        <div ref={cardRef} className={`sq-card-host min-h-[7rem] ${loading ? 'invisible' : ''}`} />
      </div>
      {payButtonPlacement === 'inline' ? (
        <Button
          className={checkoutPayButtonClass}
          size="lg"
          loading={busy}
          disabled={!card}
          onClick={payWithCard}
        >
          <CreditCard aria-hidden className="size-4" />
          {confirmLabel}
        </Button>
      ) : null}
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
          {showCardForm ? cardBlock : null}
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
