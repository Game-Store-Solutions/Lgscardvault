import { useEffect, useRef, useState } from 'react'
import { extractErrorMessage } from '../../api/client'
import { useDarkMode } from '../../hooks/useDarkMode'

type PaypalButtonsHandle = {
  render: (target: HTMLElement) => Promise<void>
  close?: () => Promise<void>
}

type PaypalApplepay = {
  config: () => Promise<{
    isEligible: boolean
    countryCode: string
    merchantCapabilities: string[]
    supportedNetworks: string[]
  }>
  validateMerchant: (input: { validationUrl: string; displayName: string }) => Promise<{ merchantSession: unknown }>
  confirmOrder: (input: { orderId: string; token: unknown; billingContact?: unknown }) => Promise<unknown>
}

type PaypalGooglepay = {
  config: () => Promise<{
    allowedPaymentMethods: unknown[]
    merchantInfo: Record<string, unknown>
  }>
  confirmOrder: (input: { orderId: string; paymentMethodData: unknown }) => Promise<{ status?: string }>
}

type PaypalNamespace = {
  FUNDING?: { PAYPAL?: string }
  Buttons: (options: {
    fundingSource?: string
    style?: {
      layout?: string
      color?: string
      shape?: string
      label?: string
      height?: number
      tagline?: boolean
      borderRadius?: number
      disableMaxWidth?: boolean
    }
    createOrder: () => Promise<string>
    onApprove: (data: { orderID: string }) => Promise<void>
    onError?: (err: unknown) => void
    onCancel?: () => void
  }) => PaypalButtonsHandle & { isEligible?: () => boolean }
  Applepay?: () => PaypalApplepay
  Googlepay?: () => PaypalGooglepay
}

type ApplePaySessionInstance = {
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null
  onpaymentauthorized: ((event: { payment: { token: unknown; billingContact?: unknown } }) => void) | null
  begin: () => void
  abort: () => void
  completeMerchantValidation: (session: unknown) => void
  completePayment: (status: number) => void
}

type ApplePaySessionCtor = {
  new (version: number, request: Record<string, unknown>): ApplePaySessionInstance
  canMakePayments: () => boolean
  STATUS_SUCCESS: number
  STATUS_FAILURE: number
}

type GooglePaymentsClient = {
  isReadyToPay: (request: unknown) => Promise<{ result?: boolean }>
  createButton: (options: {
    onClick: () => void
    allowedPaymentMethods: unknown[]
    buttonColor?: string
    buttonType?: string
    buttonSizeMode?: string
  }) => HTMLElement
  loadPaymentData: (request: unknown) => Promise<unknown>
}

const sdkPromises = new Map<string, Promise<PaypalNamespace>>()

function paypalWindow(): Window & { paypal?: PaypalNamespace; ApplePaySession?: ApplePaySessionCtor; google?: { payments?: { api?: { PaymentsClient: new (opts: unknown) => GooglePaymentsClient } } } } {
  return window as Window & {
    paypal?: PaypalNamespace
    ApplePaySession?: ApplePaySessionCtor
    google?: { payments?: { api?: { PaymentsClient: new (opts: unknown) => GooglePaymentsClient } } }
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`)
  if (existing) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(script)
  })
}

function loadPaypalSdk(clientId: string, merchantId: string, currency: string, environment: string): Promise<PaypalNamespace> {
  const key = `${environment}:${clientId}:${merchantId}:${currency}:paypal-only`
  const existing = sdkPromises.get(key)
  if (existing) {
    return existing
  }

  const promise = new Promise<PaypalNamespace>((resolve, reject) => {
    const w = paypalWindow()
    if (w.paypal?.Buttons && w.paypal.Applepay && w.paypal.Googlepay) {
      resolve(w.paypal)
      return
    }

    const host = environment === 'live' || environment === 'production' ? 'www.paypal.com' : 'www.sandbox.paypal.com'
    const params = new URLSearchParams({
      'client-id': clientId,
      currency,
      intent: 'capture',
      components: 'buttons,applepay,googlepay',
      'disable-funding': 'paylater,card,credit,venmo',
    })
    if (merchantId) {
      params.set('merchant-id', merchantId)
    }
    if (environment !== 'live' && environment !== 'production') {
      params.set('buyer-country', 'US')
    }
    const src = `https://${host}/sdk/js?${params.toString()}`
    void loadScript(src)
      .then(() => {
        const sdk = paypalWindow().paypal
        if (!sdk?.Buttons) {
          reject(new Error('PayPal SDK loaded without Buttons.'))
          return
        }
        resolve(sdk)
      })
      .catch(() => reject(new Error('Could not load PayPal.')))
  })

  sdkPromises.set(key, promise)
  return promise
}

function formatAmount(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2)
}

function themeButtonRadiusPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--radius-btn').trim()
  if (raw.endsWith('rem')) {
    return Math.round(parseFloat(raw) * 16)
  }
  if (raw.endsWith('px')) {
    return Math.round(parseFloat(raw))
  }
  const n = parseFloat(raw)
  return Number.isFinite(n) ? Math.round(n) : 12
}

export function PaypalButtons({
  clientId,
  merchantId = '',
  environment,
  currency,
  disabled,
  createOrder,
  onApproved,
  amountCents = 0,
  wallets = false,
  displayName = 'Order',
}: {
  clientId: string
  merchantId?: string
  environment: string
  currency: string
  disabled?: boolean
  createOrder: () => Promise<string>
  onApproved: (orderId: string) => Promise<void> | void
  amountCents?: number
  /** Apple Pay / Google Pay via PayPal. Hide when Square already shows those wallets. */
  wallets?: boolean
  displayName?: string
}) {
  const dark = useDarkMode()
  const paypalRef = useRef<HTMLDivElement | null>(null)
  const appleRef = useRef<HTMLDivElement | null>(null)
  const googleRef = useRef<HTMLDivElement | null>(null)
  const createOrderRef = useRef(createOrder)
  const onApprovedRef = useRef(onApproved)
  const amountCentsRef = useRef(amountCents)
  createOrderRef.current = createOrder
  onApprovedRef.current = onApproved
  amountCentsRef.current = amountCents
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId || disabled) {
      setLoading(false)
      return
    }

    let cancelled = false
    let buttons: { close?: () => Promise<void> } | null = null
    setError('')
    setLoading(true)
    const color = dark ? 'white' : 'black'
    const radius = themeButtonRadiusPx()

    void loadPaypalSdk(clientId, merchantId, currency, environment)
      .then(async (paypal) => {
        if (cancelled || !paypalRef.current) {
          return
        }
        paypalRef.current.innerHTML = ''
        const options = {
          fundingSource: paypal.FUNDING?.PAYPAL,
          style: {
            layout: 'horizontal',
            color,
            shape: 'rect',
            label: 'paypal',
            height: 48,
            tagline: false,
            borderRadius: radius,
            disableMaxWidth: true,
          },
          createOrder: () => createOrderRef.current(),
          onApprove: async (data: { orderID: string }) => {
            await onApprovedRef.current(data.orderID)
          },
          onError: (err: unknown) => {
            if (!cancelled) {
              setError(extractErrorMessage(err, 'PayPal could not complete this payment.'))
            }
          },
        }
        buttons = paypal.Buttons(options)
        if (buttons.isEligible && !buttons.isEligible()) {
          buttons = paypal.Buttons({ ...options, fundingSource: undefined })
        }
        await buttons.render(paypalRef.current)

        if (!cancelled && wallets && amountCentsRef.current > 0) {
          await mountWallets({
            paypal,
            environment,
            currency,
            amountCents: amountCentsRef.current,
            displayName,
            dark,
            radius,
            appleHost: appleRef.current,
            googleHost: googleRef.current,
            cancelled: () => cancelled,
            createOrder: () => createOrderRef.current(),
            onApproved: (orderId) => onApprovedRef.current(orderId),
            onError: (message) => {
              if (!cancelled) setError(message)
            },
          })
        }

        if (!cancelled) {
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoading(false)
          setError(err instanceof Error ? err.message : 'Could not load PayPal.')
        }
      })

    return () => {
      cancelled = true
      void buttons?.close?.()
      if (appleRef.current) appleRef.current.innerHTML = ''
      if (googleRef.current) googleRef.current.innerHTML = ''
    }
  }, [clientId, merchantId, environment, currency, disabled, wallets, displayName, dark])

  return (
    <div className="min-w-0 space-y-3 overflow-hidden rounded-xl bg-bg/90 px-3 py-4 sm:px-4 dark:bg-bg/50">
      <style>{`
        apple-pay-button {
          display: block;
          width: 100%;
          height: 48px;
          --apple-pay-button-width: 100%;
          --apple-pay-button-height: 48px;
          --apple-pay-button-border-radius: ${themeButtonRadiusPx()}px;
          --apple-pay-button-box-sizing: border-box;
        }
      `}</style>
      <p className="text-sm font-bold text-fg">PayPal</p>
      {loading ? <p className="text-xs text-fg-muted">Loading PayPal…</p> : null}
      <div className="flex min-w-0 flex-col gap-2.5">
        <div ref={appleRef} className="[&:empty]:hidden" />
        <div ref={googleRef} className="[&:empty]:hidden [&_button]:w-full [&_button]:!min-h-12" />
        <div ref={paypalRef} className="paypal-checkout-host min-w-0" />
      </div>
      {error ? (
        <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

async function mountWallets({
  paypal,
  environment,
  currency,
  amountCents,
  displayName,
  dark,
  radius,
  appleHost,
  googleHost,
  cancelled,
  createOrder,
  onApproved,
  onError,
}: {
  paypal: PaypalNamespace
  environment: string
  currency: string
  amountCents: number
  displayName: string
  dark: boolean
  radius: number
  appleHost: HTMLElement | null
  googleHost: HTMLElement | null
  cancelled: () => boolean
  createOrder: () => Promise<string>
  onApproved: (orderId: string) => Promise<void> | void
  onError: (message: string) => void
}): Promise<void> {
  const amount = formatAmount(amountCents)
  await Promise.allSettled([
    mountApplePay({
      paypal,
      currency,
      amount,
      displayName,
      dark,
      radius,
      host: appleHost,
      cancelled,
      createOrder,
      onApproved,
      onError,
    }),
    mountGooglePay({
      paypal,
      environment,
      currency,
      amount,
      dark,
      host: googleHost,
      cancelled,
      createOrder,
      onApproved,
      onError,
    }),
  ])
}

async function mountApplePay({
  paypal,
  currency,
  amount,
  displayName,
  dark,
  radius,
  host,
  cancelled,
  createOrder,
  onApproved,
  onError,
}: {
  paypal: PaypalNamespace
  currency: string
  amount: string
  displayName: string
  dark: boolean
  radius: number
  host: HTMLElement | null
  cancelled: () => boolean
  createOrder: () => Promise<string>
  onApproved: (orderId: string) => Promise<void> | void
  onError: (message: string) => void
}): Promise<void> {
  const ApplePaySession = paypalWindow().ApplePaySession
  if (!host || !paypal.Applepay || !ApplePaySession || !ApplePaySession.canMakePayments()) {
    return
  }

  try {
    await loadScript('https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js')
    if (cancelled()) return
    const applepay = paypal.Applepay()
    const config = await applepay.config()
    if (cancelled() || !config.isEligible) return

    host.innerHTML = `<apple-pay-button buttonstyle="${dark ? 'white' : 'black'}" type="plain" locale="en-US" style="--apple-pay-button-border-radius:${radius}px"></apple-pay-button>`
    const button = host.firstElementChild
    if (!(button instanceof HTMLElement)) return

    button.addEventListener('click', () => {
      const session = new ApplePaySession(4, {
        countryCode: config.countryCode,
        merchantCapabilities: config.merchantCapabilities,
        supportedNetworks: config.supportedNetworks,
        currencyCode: currency,
        requiredBillingContactFields: ['email'],
        total: { label: displayName, type: 'final', amount },
      })

      session.onvalidatemerchant = (event) => {
        void applepay
          .validateMerchant({ validationUrl: event.validationURL, displayName })
          .then((result) => session.completeMerchantValidation(result.merchantSession))
          .catch(() => session.abort())
      }

      session.onpaymentauthorized = (event) => {
        void (async () => {
          try {
            const orderId = await createOrder()
            await applepay.confirmOrder({
              orderId,
              token: event.payment.token,
              billingContact: event.payment.billingContact,
            })
            await onApproved(orderId)
            session.completePayment(ApplePaySession.STATUS_SUCCESS)
          } catch (err: unknown) {
            session.completePayment(ApplePaySession.STATUS_FAILURE)
            onError(extractErrorMessage(err, 'Apple Pay could not complete this payment.'))
          }
        })()
      }

      session.begin()
    })

  } catch {
    // Device or domain is not eligible — hide silently, like Square wallets.
  }
}

async function mountGooglePay({
  paypal,
  environment,
  currency,
  amount,
  dark,
  host,
  cancelled,
  createOrder,
  onApproved,
  onError,
}: {
  paypal: PaypalNamespace
  environment: string
  currency: string
  amount: string
  dark: boolean
  host: HTMLElement | null
  cancelled: () => boolean
  createOrder: () => Promise<string>
  onApproved: (orderId: string) => Promise<void> | void
  onError: (message: string) => void
}): Promise<void> {
  if (!host || !paypal.Googlepay) {
    return
  }

  try {
    await loadScript('https://pay.google.com/gp/p/js/pay.js')
    if (cancelled()) return
    const PaymentsClient = paypalWindow().google?.payments?.api?.PaymentsClient
    if (!PaymentsClient) return

    const googlepay = paypal.Googlepay()
    const googlePayConfig = await googlepay.config()
    const live = environment === 'live' || environment === 'production'
    const client = new PaymentsClient({
      environment: live ? 'PRODUCTION' : 'TEST',
      paymentDataCallbacks: {
        onPaymentAuthorized: async (paymentData: { paymentMethodData: unknown }) => {
          try {
            const orderId = await createOrder()
            const confirmed = await googlepay.confirmOrder({
              orderId,
              paymentMethodData: paymentData.paymentMethodData,
            })
            if (String(confirmed.status ?? '').toUpperCase() !== 'APPROVED') {
              throw new Error('Google Pay was not approved.')
            }
            await onApproved(orderId)
            return { transactionState: 'SUCCESS' }
          } catch (err: unknown) {
            onError(extractErrorMessage(err, 'Google Pay could not complete this payment.'))
            return {
              transactionState: 'ERROR',
              error: { intent: 'PAYMENT_AUTHORIZATION', message: 'TRANSACTION FAILED' },
            }
          }
        },
      },
    })

    const ready = await client.isReadyToPay({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
    })
    if (cancelled() || !ready.result) return

    host.innerHTML = ''
    const button = client.createButton({
      onClick: () => {
        void client.loadPaymentData({
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
          merchantInfo: googlePayConfig.merchantInfo,
          transactionInfo: {
            currencyCode: currency,
            totalPriceStatus: 'FINAL',
            totalPrice: amount,
          },
          callbackIntents: ['PAYMENT_AUTHORIZATION'],
        }).catch(() => undefined)
      },
      allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
      buttonColor: dark ? 'white' : 'black',
      buttonType: 'pay',
      buttonSizeMode: 'fill',
    })
    host.appendChild(button)
  } catch {
    // Browser or merchant is not eligible — hide silently.
  }
}
