import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown, CreditCard, Lock, PackageCheck, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { Order, StoreCheckoutConfig, StoreCustomer } from '../../api/types'
import { customerKeys } from '../../hooks'
import { METHOD_LABELS } from '../../pages/onboarding/config'
import { cx } from '../../lib/cx'
import { Button } from '../ui'
import { checkoutPayButtonClass, SquarePaymentPanel, type SquareCardPayAction, type TokenizedPayment } from './SquarePaymentPanel'
import { PaymentBrandMark } from './PaymentBrandMark'

type CheckoutInput = { useSavedCard: true } | TokenizedPayment | null

function paymentDisplayLabel(profile: StoreCustomer): string {
  if (profile.paymentMethodType) return METHOD_LABELS[profile.paymentMethodType]
  if (profile.paymentBrand) return profile.paymentBrand
  return 'Card'
}

function SavedCardHero({
  profile,
  amountDueCents,
  mode,
  loading,
  onPaySaved,
}: {
  profile: StoreCustomer
  amountDueCents: number
  mode: 'oneClick' | 'linkAtStore'
  loading: boolean
  onPaySaved?: () => void
}) {
  const label = paymentDisplayLabel(profile)
  const last4 = profile.paymentLast4 ?? '····'
  const heading = mode === 'oneClick' ? 'Saved card' : 'Payment method'

  return (
    <div className="rounded-xl bg-brand-50/50 px-3.5 py-3 dark:bg-brand-950/25">
      <div className="flex items-center gap-3">
        <PaymentBrandMark brand={profile.paymentBrand ?? label} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{heading}</p>
          <p className="truncate font-display text-lg font-bold tracking-tight text-fg">
            {label} ···· {last4}
          </p>
          {profile.paymentExpires ? (
            <p className="text-xs text-fg-muted">Expires {profile.paymentExpires}</p>
          ) : null}
        </div>
        {mode === 'oneClick' ? (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-800 dark:bg-success-950/60 dark:text-success-300 sm:inline-flex">
            <Sparkles aria-hidden className="size-3" />
            One-click
          </span>
        ) : null}
      </div>

      {mode === 'oneClick' ? (
        <Button className={cx(checkoutPayButtonClass, 'mt-3')} size="lg" loading={loading} onClick={onPaySaved}>
          <Wallet aria-hidden className="size-4" />
          Pay {formatPrice(amountDueCents)} with saved card
        </Button>
      ) : (
        <p className="mt-2 text-xs leading-5 text-fg-muted">
          We&apos;ll save this card for one-click checkout after you confirm.
        </p>
      )}
    </div>
  )
}

function AlternatePaymentAccordion({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const panelId = useId()

  return (
    <div className="rounded-xl bg-bg/70 dark:bg-bg/30">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-bg/80 sm:px-4"
        onClick={() => onOpenChange(!open)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">{title}</span>
          {subtitle ? <span className="mt-0.5 block text-xs leading-snug text-fg-muted">{subtitle}</span> : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cx('size-4 shrink-0 text-fg-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div id={panelId} className="px-3.5 pb-3.5 pt-1 sm:px-4 sm:pb-4">
        {open ? children : null}
      </div>
    </div>
  )
}

/**
 * Real checkout: the shopper pays the STORE through that store's own connected
 * Square account.
 */
export function CheckoutPanel({
  slug,
  amountDueCents,
  buyerEmail,
  checkoutPath,
  checkoutBody,
  paymentReady,
  isGuest = false,
  paymentBlockedMessage = 'Enter your name to continue.',
  onPlaced,
}: {
  slug: string
  amountDueCents: number
  buyerEmail: string
  checkoutPath: string
  checkoutBody: Record<string, unknown>
  paymentReady: boolean
  isGuest?: boolean
  paymentBlockedMessage?: string
  onPlaced: (order: Order) => void
}) {
  const configQuery = useQuery({
    queryKey: ['store-checkout-config', slug],
    queryFn: async () => {
      const { data } = await api.get<StoreCheckoutConfig>(`/stores/${slug}/customer/checkout/config`)
      return data
    },
  })

  const profileQuery = useQuery({
    queryKey: customerKeys.profile(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreCustomer>(`/stores/${slug}/customer`)
      return data
    },
    enabled: !isGuest,
  })

  const checkout = useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const body =
        input && 'useSavedCard' in input
          ? { ...checkoutBody, useSavedCard: true }
          : {
              ...checkoutBody,
              ...(input
                ? {
                    token: input.token,
                    verificationToken: input.verificationToken,
                    methodType: input.methodType,
                  }
                : {}),
            }
      const { data } = await api.post<Order>(checkoutPath, body)
      return data
    },
    onSuccess: onPlaced,
  })

  const config = configQuery.data
  const profile = profileQuery.data
  const loadingConfig = configQuery.isLoading
  const checkingSaved = !isGuest && profileQuery.isLoading

  const hasAccountCardEarly =
    !isGuest && profile?.paymentConfigured && profile.paymentLast4 && !profile.savedCardReady

  const [altPaymentOpen, setAltPaymentOpen] = useState<boolean | null>(null)
  const [cardPayAction, setCardPayAction] = useState<SquareCardPayAction | null>(null)

  useEffect(() => {
    if (hasAccountCardEarly) setAltPaymentOpen(true)
  }, [hasAccountCardEarly])

  if (loadingConfig) {
    return (
      <Button className="mt-5 w-full" size="lg" disabled>
        <PackageCheck aria-hidden className="size-4" />
        Loading checkout…
      </Button>
    )
  }

  if (!config?.enabled) {
    return (
      <div className="mt-5 space-y-2">
        <Button className="w-full" size="lg" disabled title="This store has not enabled online payments">
          <Lock aria-hidden className="size-4" />
          Pay with card
        </Button>
        <p className="rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">
          Online card checkout is not available for this store yet.
        </p>
      </div>
    )
  }

  const fullyCovered = amountDueCents <= 0

  if (!paymentReady) {
    return (
      <p className="mt-5 rounded-btn bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">{paymentBlockedMessage}</p>
    )
  }

  const canUseSaved = !isGuest && profile?.savedCardReady && profile.paymentLast4
  const hasAccountCard = hasAccountCardEarly
  const hasAnySavedDisplay = Boolean(canUseSaved || hasAccountCard)

  const accordionOpen = altPaymentOpen ?? Boolean(hasAccountCard)
  const showExternalCardPay = hasAnySavedDisplay && (Boolean(hasAccountCard) || accordionOpen)
  const payLabel = `Pay ${formatPrice(amountDueCents)}`

  const squarePanel = (
    <SquarePaymentPanel
      applicationId={config.applicationId}
      locationId={config.locationId}
      environment={config.environment}
      priceCents={amountDueCents}
      currency={config.currency}
      countryCode={config.countryCode}
      billingEmail={buyerEmail}
      confirmLabel={payLabel}
      paymentRequestLabel="Order total"
      layout="checkout"
      payButtonPlacement={hasAnySavedDisplay ? 'external' : 'inline'}
      onPayActionChange={hasAnySavedDisplay ? setCardPayAction : undefined}
      onTokenized={(payment) => checkout.mutate(payment)}
    />
  )

  return (
    <div className="mt-5 pt-5">
      <p className="text-sm font-semibold text-fg">Payment method</p>

      {fullyCovered ? (
        <Button
          className={cx(checkoutPayButtonClass, 'mt-4')}
          size="lg"
          loading={checkout.isPending}
          onClick={() => checkout.mutate(null)}
        >
          <PackageCheck aria-hidden className="size-4" />
          Place order with store credit
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          {checkingSaved ? (
            <div className="animate-pulse rounded-xl bg-bg/70 px-3.5 py-4">
              <div className="h-4 w-32 rounded bg-border" />
              <div className="mt-2 h-6 w-48 rounded bg-border" />
            </div>
          ) : null}

          {!checkingSaved && canUseSaved && profile ? (
            <SavedCardHero
              profile={profile}
              amountDueCents={amountDueCents}
              mode="oneClick"
              loading={checkout.isPending}
              onPaySaved={() => checkout.mutate({ useSavedCard: true })}
            />
          ) : null}

          {!checkingSaved && hasAccountCard && profile ? (
            <SavedCardHero profile={profile} amountDueCents={amountDueCents} mode="linkAtStore" loading={false} />
          ) : null}

          {!checkingSaved && hasAnySavedDisplay ? (
            <>
              <AlternatePaymentAccordion
                open={accordionOpen}
                onOpenChange={setAltPaymentOpen}
                title={canUseSaved ? 'Use a different card or wallet' : 'Confirm payment at this store'}
                subtitle={
                  canUseSaved ? 'Google Pay, Apple Pay, or another card' : 'One-time confirmation with this store'
                }
              >
                {squarePanel}
              </AlternatePaymentAccordion>
              {showExternalCardPay && cardPayAction ? (
                <Button
                  className={checkoutPayButtonClass}
                  size="lg"
                  loading={checkout.isPending || cardPayAction.busy}
                  disabled={!cardPayAction.cardReady}
                  onClick={cardPayAction.payWithCard}
                >
                  <CreditCard aria-hidden className="size-4" />
                  {cardPayAction.label}
                </Button>
              ) : null}
            </>
          ) : null}

          {!checkingSaved && !hasAnySavedDisplay ? squarePanel : null}
        </div>
      )}

      {checkout.isPending && (
        <p role="status" className="mt-3 text-xs font-medium text-fg-muted">
          Completing your order…
        </p>
      )}

      {Boolean(checkout.error) && (
        <p
          role="alert"
          className="mt-3 rounded-btn bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700 dark:bg-danger-950/40"
        >
          {extractErrorMessage(checkout.error, 'Your payment could not be completed.')}
        </p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
        <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-success-700" />
        Payments are processed by Square. We never store your full card number.
      </p>
    </div>
  )
}