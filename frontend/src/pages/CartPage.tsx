import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  CheckCircle2,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, scryfallPriceCents } from '../api/client'
import type { CartItem, CheckoutQuote, InventoryItem, Order, SealedInventoryLine, StoreCreditSummary } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { inventoryKey, ordersKey, useCanManageStore, useDebouncedValue, useInventory, useKioskMode, useStore, useStoreCart, useStoreTheme } from '../hooks'
import { customerKeys } from '../hooks/useCustomer'
import { guestCartKey, guestCartLines, resetGuestCart } from '../hooks/useGuestCart'
import { BackButton, Badge, Button, buttonVariants, EmptyState, Input } from '../components/ui'
import { CheckoutPanel } from '../components/payments/CheckoutPanel'
import { CardImage, SpotlightCard } from '../components/cards'
import { FoilOverlays } from '../components/cards/FoilOverlays'
import { cx } from '../lib/cx'
import { finishName } from '../lib/finishes'
import { FOIL_GRADIENT, rarityAccent } from '../lib/mtg'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { AnimatePresence, motion, Reveal } from '../components/motion'

import { showDevCheckoutTools } from '../lib/runtimeEnv'

const TEST_CHECKOUT_ENABLED = showDevCheckoutTools

function lineUnitCents(entry: CartItem): number {
  return entry.sealedItem?.priceCents ?? entry.inventoryItem?.priceCents ?? 0
}

interface RemovedLine {
  item: InventoryItem
  quantity: number
}

function useElementInView(id: string, enabled: boolean) {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setInView(false)
      return
    }
    const node = document.getElementById(id)
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.18,
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [id, enabled])

  return inView
}

export default function CartPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { user, isSuperAdmin } = useAuth()
  const canManage = useCanManageStore(slug)
  const showOwnerCheckoutDiagnostics = canManage || isSuperAdmin
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  useStoreTheme(store)

  const isGuest = !user
  const { query, setItem, removeItem, setSealedItem, removeSealedItem, clear } = useStoreCart(slug, Boolean(user))
  const { data: cart = [], isLoading } = query
  const [removed, setRemoved] = useState<RemovedLine | null>(null)
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null)
  const fulfillment = 'pickup' as const
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const { kioskMode } = useKioskMode()
  const [kioskCustomerName, setKioskCustomerName] = useState('')
  const [useCredit, setUseCredit] = useState(false)

  // Store credit can be applied by signed-in customers (not kiosk walk-ups).
  const creditQuery = useQuery({
    queryKey: ['store-credit', slug],
    enabled: Boolean(user && slug && !kioskMode),
    queryFn: async () => {
      const { data } = await api.get<StoreCreditSummary>(`/stores/${slug}/customer/credit`)
      return data
    },
  })
  const creditBalanceCents = creditQuery.data?.balanceCents ?? 0

  useEffect(() => {
    if (user) {
      setContactName(user.displayName ?? '')
      setContactEmail(user.email ?? '')
    }
  }, [user])

  const checkoutConfigQuery = useQuery({
    queryKey: ['store-checkout-config', slug, isGuest ? 'guest' : 'customer'],
    enabled: Boolean(slug && !kioskMode),
    queryFn: async () => {
      const path = isGuest ? `/stores/${slug}/guest/checkout/config` : `/stores/${slug}/customer/checkout/config`
      const { data } = await api.get<{ enabled: boolean }>(path)
      return data
    },
  })
  const squareCheckoutEnabled = checkoutConfigQuery.data?.enabled === true

  /** Shared by the paid and simulated paths: both empty the cart and move stock. */
  const handleOrderPlaced = useCallback(
    async (order: Order) => {
      setCreatedOrder(order)
      setKioskCustomerName('')
      if (isGuest) {
        resetGuestCart(slug)
        queryClient.setQueryData(guestCartKey(slug), [])
        await queryClient.invalidateQueries({ queryKey: guestCartKey(slug) })
      } else {
        queryClient.setQueryData(customerKeys.cart(slug), [])
        await queryClient.invalidateQueries({ queryKey: customerKeys.cart(slug) })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.ordersPrefix(slug) }),
        queryClient.invalidateQueries({ queryKey: ['my-orders'] }),
        queryClient.invalidateQueries({ queryKey: ordersKey(slug) }),
        queryClient.invalidateQueries({ queryKey: inventoryKey(slug) }),
        queryClient.invalidateQueries({ queryKey: ['store-credit', slug] }),
      ])
    },
    [queryClient, slug, isGuest],
  )

  useEffect(() => {
    if (!kioskMode || !createdOrder) return
    const timer = window.setTimeout(() => {
      setCreatedOrder(null)
      navigate(`/s/${slug}`)
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [createdOrder, kioskMode, navigate, slug])

  const testOrder = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Order>(`/stores/${slug}/customer/test-order`, {
        fulfillment: kioskMode ? 'pickup' : fulfillment,
        ...(kioskMode ? { channel: 'kiosk', customerName: kioskCustomerName.trim() } : {}),
        ...(useCredit && !kioskMode ? { useStoreCredit: true } : {}),
      })
      return data
    },
    onSuccess: handleOrderPlaced,
  })

  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), 6500)
    return () => clearTimeout(timer)
  }, [removed])

  const { itemCount, subtotalCents } = useMemo(() => {
    let itemCount = 0
    let subtotalCents = 0

    for (const entry of cart) {
      itemCount += entry.quantity
      const unit = lineUnitCents(entry)
      subtotalCents += unit * entry.quantity
    }

    return { itemCount, subtotalCents }
  }, [cart])

  const subtotalLabel = formatPrice(subtotalCents)
  const summaryInView = useElementInView('order-summary', cart.length > 0 && !createdOrder && !isLoading)

  const checkoutPath = isGuest ? `/stores/${slug}/guest/checkout` : `/stores/${slug}/customer/checkout`
  const checkoutBody = useMemo(
    () => ({
      fulfillment: 'pickup' as const,
      customerName: (kioskMode ? kioskCustomerName : contactName).trim(),
      customerEmail: contactEmail.trim() || undefined,
      ...(isGuest ? { lines: guestCartLines(cart) } : { useStoreCredit: useCredit }),
    }),
    [cart, contactEmail, contactName, isGuest, kioskCustomerName, kioskMode, useCredit],
  )
  const paymentReady = Boolean((kioskMode ? kioskCustomerName : contactName).trim())

  const quoteQuery = useQuery({
    queryKey: [
      'checkout-quote',
      slug,
      isGuest ? 'guest' : 'customer',
      useCredit,
      cart.map((entry) => `${entry.inventoryItem?.id ?? `s${entry.sealedItem?.id}`}:${entry.quantity}`).join('|'),
    ],
    enabled: Boolean(slug && cart.length > 0 && !kioskMode && !createdOrder),
    queryFn: async () => {
      const path = isGuest ? `/stores/${slug}/guest/checkout/quote` : `/stores/${slug}/customer/checkout/quote`
      const { data } = await api.post<CheckoutQuote>(
        path,
        isGuest ? { lines: guestCartLines(cart) } : { useStoreCredit: useCredit },
      )
      return data
    },
  })
  const quote = quoteQuery.data

  const { data: inventory = [] } = useInventory(slug, { inStockOnly: true })
  const picks = useMemo(
    () =>
      inventory
        .filter((item) => item.quantity > 0)
        .map((item) => ({ item, cents: scryfallPriceCents(item.card, item.isFoil ? 'foil' : 'nonfoil') }))
        .filter(({ cents }) => cents !== null)
        .sort((a, b) => (b.cents ?? 0) - (a.cents ?? 0))
        .slice(0, 6)
        .map(({ item }) => item),
    [inventory],
  )

  function handleRemove(entry: CartItem) {
    // Undo is offered for singles; sealed lines are re-added from the
    // storefront's sealed row, which stays a click away.
    if (entry.sealedItem) {
      removeSealedItem.mutate(entry.sealedItem)
      return
    }
    if (!entry.inventoryItem) return
    setRemoved({ item: entry.inventoryItem, quantity: entry.quantity })
    removeItem.mutate(entry.inventoryItem)
  }

  function handleUndo() {
    if (!removed) return
    setItem.mutate({ item: removed.item, quantity: removed.quantity })
    setRemoved(null)
  }

  if (!user && kioskMode) {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-border bg-surface shadow-card">
        <EmptyState
          icon={ShoppingCart}
          title="Sign in for kiosk mode"
          description="Kiosk checkout is only available on a signed-in store terminal."
          action={
            <Link to="/login" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              Sign in
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="relative space-y-5 pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:space-y-8 lg:pb-10">
      <p role="status" aria-live="polite" className="sr-only">
        {itemCount === 0
          ? 'Your cart is empty.'
          : `Cart updated. ${itemCount} item${itemCount === 1 ? '' : 's'}, estimated total ${subtotalLabel}.`}
      </p>

      <Reveal immediate className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <BackButton to={`/s/${slug}`}>Back to store</BackButton>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[1.65rem] font-bold leading-none tracking-tight text-fg sm:text-3xl">
              Checkout
            </h1>
            {cart.length > 0 && (
              <span className="inline-flex h-7 items-center rounded-full bg-brand-500/12 px-2.5 text-xs font-bold text-brand-700 dark:text-brand-300">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-fg-muted">{store?.name ?? 'Store'}</p>
        </div>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => clear.mutate()} loading={clear.isPending} className="text-fg-muted">
            <Trash2 aria-hidden className="size-4" />
            Clear
          </Button>
        )}
      </Reveal>

      {isLoading ? (
        <StorePageLoader label="Loading your cart…" />
      ) : kioskMode && createdOrder ? (
        <KioskOrderComplete reference={createdOrder.reference} />
      ) : createdOrder ? (
        <OrderPlacedConfirmation slug={slug} order={createdOrder} storeName={store?.name ?? 'the store'} />
      ) : cart.length === 0 ? (
        <EmptyCart slug={slug} storeName={store?.name ?? 'the store'} picks={picks} />
      ) : (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
          <div className="space-y-5 lg:space-y-6">
            {!kioskMode && (
              <Reveal immediate className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold tracking-tight text-fg sm:text-base">Contact</h2>
                  {isGuest && (
                    <Link to="/login" className="text-xs font-semibold text-brand-600 hover:underline sm:text-sm">
                      Log in for order history
                    </Link>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <Input
                    label={isGuest ? 'Your name (required)' : 'Name'}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="For pickup at the store"
                    maxLength={255}
                    required
                    autoComplete="name"
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={isGuest ? 'Receipt & updates (optional)' : 'Receipt email'}
                    maxLength={255}
                    autoComplete="email"
                  />
                </div>
              </Reveal>
            )}

            {!kioskMode && (
              <Reveal immediate delay={0.04} className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
                <h2 className="text-sm font-bold tracking-tight text-fg sm:text-base">Pickup</h2>
                <p className="mt-3 text-sm leading-6 text-fg-muted">
                  Pay online with a card, or reserve and pay at the counter.{' '}
                  <span className="font-semibold text-fg">Pick up at {store?.name ?? 'the store'}</span>
                  {isGuest ? '. Guest checkout is pickup only.' : '.'} We do not ship.
                </p>
              </Reveal>
            )}

            <section>
              <h2 className="mb-3 text-sm font-bold tracking-tight text-fg sm:text-base">Items</h2>
              <ul className="space-y-2.5 sm:space-y-3">
                <AnimatePresence initial={false}>
                  {cart.map((entry) =>
                    entry.sealedItem ? (
                      <motion.li
                        key={`sealed-${entry.sealedItem.id}`}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      >
                        <SealedCartLine
                          entry={entry}
                          sealed={entry.sealedItem}
                          onSetQuantity={(quantity) => setSealedItem.mutate({ item: entry.sealedItem!, quantity })}
                          onRemove={() => handleRemove(entry)}
                        />
                      </motion.li>
                    ) : entry.inventoryItem ? (
                      <motion.li
                        key={entry.inventoryItem.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      >
                        <CartLine
                          entry={entry}
                          slug={slug}
                          item={entry.inventoryItem}
                          onSetQuantity={(quantity) => setItem.mutate({ item: entry.inventoryItem!, quantity })}
                          onRemove={() => handleRemove(entry)}
                        />
                      </motion.li>
                    ) : null,
                  )}
                </AnimatePresence>
              </ul>
            </section>
          </div>

          <OrderSummary
            slug={slug}
            showOwnerCheckoutDiagnostics={showOwnerCheckoutDiagnostics}
            paymentsAdminHref={showOwnerCheckoutDiagnostics ? `/s/${slug}/admin/payments` : undefined}
            itemCount={itemCount}
            subtotalLabel={subtotalLabel}
            kioskMode={kioskMode}
            creditBalanceCents={creditBalanceCents}
            useCredit={useCredit}
            onUseCreditChange={setUseCredit}
            subtotalCents={subtotalCents}
            quote={quote}
            kioskCustomerName={kioskCustomerName}
            onKioskCustomerNameChange={setKioskCustomerName}
            buyerEmail={contactEmail.trim() || user?.email || ''}
            checkoutPath={checkoutPath}
            checkoutBody={checkoutBody}
            paymentReady={paymentReady}
            fulfillment={fulfillment}
            isGuest={isGuest}
            testCheckoutEnabled={TEST_CHECKOUT_ENABLED && !squareCheckoutEnabled}
            testOrderPending={testOrder.isPending}
            testOrderError={testOrder.error}
            createdOrder={createdOrder}
            onCreateTestOrder={() => testOrder.mutate()}
            onOrderPlaced={handleOrderPlaced}
          />
        </div>
      )}

      {removed && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-xl lg:bottom-6"
        >
          <p className="min-w-0 truncate text-sm text-fg">
            Removed <span className="font-bold">{removed.item.card.name}</span>
          </p>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-bold text-brand-600 hover:underline"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Undo
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {cart.length > 0 && !createdOrder && !summaryInView && (
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-3 shadow-[0_-12px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur-md lg:hidden"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto flex max-w-7xl items-center gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </p>
          <p className="font-display text-xl font-extrabold leading-none text-fg">
            {formatPrice(quote?.dueCents ?? subtotalCents)}
          </p>
              </div>
              <a href="#order-summary" className={cx(buttonVariants({ variant: 'primary', size: 'lg' }), 'min-h-12 flex-1')}>
                <PackageCheck aria-hidden className="size-4" />
                Checkout
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function OrderPlacedConfirmation({
  slug,
  order,
  storeName,
}: {
  slug: string
  order: Order
  storeName: string
}) {
  const unpaid = (order.paidCents ?? 0) <= 0 && (order.creditAppliedCents ?? 0) < order.totalCents
  const payInStore = unpaid && (order.notes === 'Paying in store' || order.fulfillment === 'pickup')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-lg space-y-5 rounded-card border border-border bg-surface px-5 py-8 text-center shadow-card sm:px-6 sm:py-10"
    >
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-50 text-success-700">
        <CheckCircle2 aria-hidden className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold text-fg">
          {payInStore ? 'Order reserved' : 'Order placed'}
        </h2>
        <p className="mt-1 font-mono text-sm font-medium text-fg-muted">{order.reference}</p>
      </div>
      {payInStore ? (
        <p className="text-sm leading-6 text-fg-muted">
          {storeName} will hold your items. Pay at the counter when you pick up.
        </p>
      ) : (
        <p className="text-sm leading-6 text-fg-muted">Thanks — your payment went through. We&apos;ll have it ready.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to={`/s/${slug}`} className={buttonVariants({ variant: 'primary', size: 'md' })}>
          Back to store
        </Link>
        <Link to={`/s/${slug}/account`} className={buttonVariants({ variant: 'secondary', size: 'md' })}>
          View orders
        </Link>
      </div>
    </motion.div>
  )
}

function KioskOrderComplete({ reference }: { reference: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-6 py-16 text-center shadow-card">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-50 text-success-700">
        <CheckCircle2 aria-hidden className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-bold text-fg">Kiosk order placed</h2>
      <p className="mt-2 text-sm text-fg-muted">{reference}</p>
      <p className="mt-4 text-sm font-medium text-fg">Returning to the store in 5 seconds…</p>
    </div>
  )
}

function EmptyCart({ slug, storeName, picks }: { slug: string; storeName: string; picks: InventoryItem[] }) {
  return (
    <div className="space-y-8 sm:space-y-10">
      <Reveal immediate className="rounded-card border border-border bg-surface shadow-card">
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description={`Singles you add from ${storeName} will wait for you here.`}
          action={
            <Link to={`/s/${slug}`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              Browse cards
            </Link>
          }
        />
      </Reveal>

      {picks.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg">
                <Sparkles aria-hidden className="size-5 text-brand-600" />
                Picks from {storeName}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">A quick path back into high-signal listings.</p>
            </div>
            <Link to={`/s/${slug}`} className="shrink-0 text-sm font-bold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {picks.map((item) => (
              <SpotlightCard key={item.id} item={item} slug={slug} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function OrderSummary({
  slug,
  itemCount,
  subtotalLabel,
  fulfillment,
  kioskMode = false,
  creditBalanceCents = 0,
  useCredit = false,
  onUseCreditChange,
  subtotalCents = 0,
  quote,
  kioskCustomerName = '',
  onKioskCustomerNameChange,
  buyerEmail,
  checkoutPath,
  checkoutBody,
  paymentReady,
  isGuest = false,
  paymentsAdminHref,
  showOwnerCheckoutDiagnostics = false,
  testCheckoutEnabled,
  testOrderPending,
  testOrderError,
  createdOrder,
  onCreateTestOrder,
  onOrderPlaced,
}: {
  slug: string
  itemCount: number
  subtotalLabel: string
  fulfillment: 'pickup'
  kioskMode?: boolean
  creditBalanceCents?: number
  useCredit?: boolean
  onUseCreditChange?: (value: boolean) => void
  subtotalCents?: number
  quote?: CheckoutQuote
  kioskCustomerName?: string
  onKioskCustomerNameChange?: (value: string) => void
  buyerEmail: string
  checkoutPath: string
  checkoutBody: Record<string, unknown>
  paymentReady: boolean
  isGuest?: boolean
  paymentsAdminHref?: string
  showOwnerCheckoutDiagnostics?: boolean
  testCheckoutEnabled: boolean
  testOrderPending: boolean
  testOrderError: unknown
  createdOrder: Order | null
  onCreateTestOrder: () => void
  onOrderPlaced: (order: Order) => void
}) {
  const creditApplied = quote?.creditCents ?? (!kioskMode && !isGuest && useCredit ? Math.min(creditBalanceCents, subtotalCents) : 0)
  const taxCents = quote?.taxCents ?? 0
  const merchandiseDueCents = Math.max(0, subtotalCents - creditApplied)
  const dueCents = quote?.dueCents ?? merchandiseDueCents
  return (
    <aside id="order-summary" className="scroll-mt-24 min-w-0 overflow-x-clip rounded-card border border-border bg-surface p-4 shadow-card sm:p-5 lg:sticky lg:top-20 lg:bg-bg/80">
      <h2 className="font-display text-lg font-bold text-fg">Order summary</h2>
      <p className="mt-1 text-sm text-fg-muted">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </p>

      {kioskMode && (
        <div className="mt-5">
          <Input
            label="Your name"
            value={kioskCustomerName}
            onChange={(e) => onKioskCustomerNameChange?.(e.target.value)}
            placeholder="So staff know whose order this is"
            maxLength={255}
          />
        </div>
      )}

      <dl className="mt-5 text-sm">
        <div className="space-y-1">
          <SummaryRow label={`Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`} value={subtotalLabel} strong />
          <SummaryRow label="Pickup" value="Free. In-store pickup" />
          <SummaryRow
            label="Tax"
            value={quote ? formatPrice(taxCents) : 'Quoted at checkout'}
          />
          {creditApplied > 0 && <SummaryRow label="Store credit" value={`−${formatPrice(creditApplied)}`} />}
        </div>
        <div className="mt-6 flex items-baseline justify-between gap-3 border-t border-border/80 pt-5">
          <dt className="text-xs font-bold uppercase tracking-wide text-fg-muted">Total</dt>
          <dd className="font-display text-3xl font-extrabold tracking-tight text-fg">
            {formatPrice(dueCents)}
          </dd>
        </div>
        {quote?.taxNote ? <p className="mt-2 text-xs leading-5 text-fg-muted">{quote.taxNote}</p> : null}
      </dl>

      {!kioskMode && !isGuest && creditBalanceCents > 0 && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-btn border border-success-500/30 bg-success-50 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-success-700">
            <input
              type="checkbox"
              checked={useCredit}
              onChange={(e) => onUseCreditChange?.(e.target.checked)}
              className="size-4 accent-current"
            />
            Apply store credit
          </span>
          <span className="font-bold text-success-700">{formatPrice(creditBalanceCents)} available</span>
        </label>
      )}

      {/* Kiosk rings up walk-ups at the counter and takes payment in person, so
          it never shows the card form. */}
      {kioskMode ? (
        <div className="mt-5 space-y-3">
          <Button
            className="w-full"
            size="lg"
            loading={testOrderPending}
            disabled={!kioskCustomerName.trim()}
            onClick={onCreateTestOrder}
          >
            <PackageCheck aria-hidden className="size-4" />
            Place kiosk order
          </Button>
        </div>
      ) : (
        <CheckoutPanel
          slug={slug}
          amountDueCents={dueCents}
          reserveAmountCents={merchandiseDueCents}
          buyerEmail={buyerEmail}
          checkoutPath={checkoutPath}
          checkoutBody={checkoutBody}
          paymentReady={paymentReady}
          fulfillment={fulfillment}
          isGuest={isGuest}
          showOwnerDiagnostics={showOwnerCheckoutDiagnostics}
          paymentsAdminHref={paymentsAdminHref}
          cardCheckoutReady={quote?.taxReady !== false}
          cardCheckoutBlockedMessage={quote?.taxBlockReason}
          onPlaced={onOrderPlaced}
        />
      )}

      {testCheckoutEnabled && !kioskMode && (
        <div className="mt-3 space-y-2">
          <Button
            variant="secondary"
            className="w-full"
            loading={testOrderPending}
            onClick={onCreateTestOrder}
          >
            <PackageCheck aria-hidden className="size-4" />
            Create test order (no charge)
          </Button>
          <p className="rounded-btn border border-warning-500/30 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-700">
            Developer shortcut. Places an order without charging a card.
          </p>
        </div>
      )}

      {Boolean(testOrderError) && (
        <p className="mt-3 rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {extractErrorMessage(testOrderError, 'Could not create order.')}
        </p>
      )}

      {createdOrder && !kioskMode && (
        <Link to={`/s/${slug}/admin/orders`} className={`${buttonVariants({ variant: 'secondary', size: 'md' })} mt-3 w-full`}>
          View {createdOrder.reference}
        </Link>
      )}

      <BackButton to={`/s/${slug}`} className="mt-4">
        Back to store
      </BackButton>
    </aside>
  )
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={strong ? 'font-bold text-fg' : 'text-right text-fg-muted'}>{value}</dd>
    </div>
  )
}

/**
 * Cart line for a sealed product. Deliberately simpler than the singles
 * line: no condition, foil, rarity accent, or card link — a sealed box has
 * none of those axes.
 */
function SealedCartLine({
  entry,
  sealed,
  onSetQuantity,
  onRemove,
}: {
  entry: CartItem
  sealed: SealedInventoryLine
  onSetQuantity: (quantity: number) => void
  onRemove: () => void
}) {
  const product = sealed.product
  const atMax = entry.quantity >= sealed.quantity
  const linePrice = formatPrice(sealed.priceCents * entry.quantity)

  function step(delta: number) {
    const next = Math.max(1, Math.min(entry.quantity + delta, sealed.quantity))
    if (next !== entry.quantity) onSetQuantity(next)
  }

  return (
    <article className="flex gap-3 rounded-card border border-border bg-surface p-3 shadow-card sm:gap-4 sm:p-4">
      <div className="grid h-[5.5rem] w-[4rem] shrink-0 place-items-center overflow-hidden rounded-btn border border-border bg-bg sm:h-32 sm:w-24">
        <CardImage
          src={product?.imageUrl}
          alt={product?.name ?? 'Sealed product'}
          fit="contain"
          className="size-full"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[0.95rem] font-extrabold leading-snug tracking-tight text-fg sm:text-xl [overflow-wrap:anywhere]">
              {product?.name ?? 'Sealed product'}
            </p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-fg-muted sm:text-xs">
              {[product?.gameName ?? product?.gameCode, product?.setName].filter(Boolean).join(' / ') || 'Sealed'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="brand">Sealed</Badge>
              {sealed.quantity <= 3 && <Badge tone="warning">Low stock</Badge>}
            </div>
          </div>
          <p className="shrink-0 font-display text-lg font-extrabold text-fg sm:text-2xl">{linePrice}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="inline-flex h-11 items-center overflow-hidden rounded-btn border border-border">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={entry.quantity <= 1}
              aria-label="Decrease quantity"
              className="grid h-11 w-11 place-items-center text-fg-muted disabled:opacity-40 hover:text-fg touch-manipulation"
            >
              −
            </button>
            <span className="min-w-8 px-1 text-center text-sm font-bold text-fg">{entry.quantity}</span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={atMax}
              aria-label="Increase quantity"
              className="grid h-11 w-11 place-items-center text-fg-muted disabled:opacity-40 hover:text-fg touch-manipulation"
            >
              +
            </button>
          </div>
          <span className="text-xs text-fg-muted sm:text-sm">{formatPrice(sealed.priceCents)} each</span>
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-sm font-bold text-fg-muted hover:bg-danger-50 hover:text-danger-700"
          >
            <Trash2 aria-hidden className="size-4" />
            <span className="hidden sm:inline">Remove</span>
          </button>
        </div>
      </div>
    </article>
  )
}

function CartLine({
  entry,
  slug,
  item,
  onSetQuantity,
  onRemove,
}: {
  entry: CartItem
  slug: string
  item: InventoryItem
  onSetQuantity: (quantity: number) => void
  onRemove: () => void
}) {
  const accent = rarityAccent(item.card.rarity)
  const image = cardImage(item.card)
  const unit = lineUnitCents(entry)
  const atMax = entry.quantity >= item.quantity
  const linePrice = formatPrice(unit * entry.quantity)

  const [text, setText] = useState(String(entry.quantity))

  useEffect(() => {
    setText(String(entry.quantity))
  }, [entry.quantity])

  const debounced = useDebouncedValue(text, 350)
  useEffect(() => {
    const parsed = Number.parseInt(debounced, 10)
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed !== entry.quantity) {
      onSetQuantity(Math.min(parsed, item.quantity))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  function step(delta: number) {
    const next = Math.max(1, Math.min(entry.quantity + delta, item.quantity))
    setText(String(next))
    if (next !== entry.quantity) onSetQuantity(next)
  }

  return (
    <article className="flex gap-3 rounded-card border border-border bg-surface p-3 shadow-card sm:gap-4 sm:p-4">
      <Link
        to={`/s/${slug}/cards/${item.id}`}
        className={cx(
          'relative h-[5.5rem] w-[4rem] shrink-0 overflow-hidden rounded-btn border-2 bg-bg sm:h-32 sm:w-24',
          item.isFoil && 'foil-card',
        )}
        style={{ borderColor: accent }}
      >
        <CardImage src={image} alt={item.card.name} className="size-full" />
        {item.isFoil && <FoilOverlays foil glare={false} />}
      </Link>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/s/${slug}/cards/${item.id}`}
              className="font-display text-[0.95rem] font-extrabold leading-snug tracking-tight text-fg hover:text-brand-600 sm:text-xl [overflow-wrap:anywhere]"
            >
              {item.card.name}
            </Link>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-fg-muted sm:text-xs">
              {item.card.setName ?? item.card.setCode?.toUpperCase() ?? '-'} / #{item.card.collectorNumber ?? '-'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{item.condition}</Badge>
              {item.isFoil ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-white/60 px-2 py-0.5 text-[11px] font-bold text-black/80 sm:text-xs"
                  style={{ backgroundImage: FOIL_GRADIENT }}
                >
                  <Sparkles aria-hidden className="size-3" />
                  {finishName(item.card, true, item.finish)}
                </span>
              ) : (
                <Badge tone="neutral">{finishName(item.card, false, item.finish)}</Badge>
              )}
              {item.quantity <= 3 && <Badge tone="warning">Low stock</Badge>}
            </div>
          </div>
          <p className="shrink-0 font-display text-lg font-extrabold text-fg sm:text-2xl">{linePrice}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 sm:gap-3">
          <QuantityControl
            value={text}
            atMin={entry.quantity <= 1}
            atMax={atMax}
            cardName={item.card.name}
            onDecrement={() => step(-1)}
            onIncrement={() => step(1)}
            onTextChange={setText}
            onBlur={() => {
              const parsed = Number.parseInt(text, 10)
              if (Number.isNaN(parsed) || parsed < 1) setText(String(entry.quantity))
              else setText(String(Math.min(parsed, item.quantity)))
            }}
          />
          <p className="min-w-0 text-[11px] leading-5 text-fg-muted sm:text-xs">
            <span className="font-bold text-fg">{formatPrice(unit)}</span>
            <span className="hidden sm:inline"> each</span>
            <span className="mx-1" aria-hidden>
              ·
            </span>
            <span className={cx(atMax && 'font-bold text-warning-700')}>
              {atMax ? `${item.quantity} left` : `${item.quantity} in stock`}
            </span>
          </p>
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-sm font-bold text-fg-muted transition-colors hover:bg-danger-50 hover:text-danger-700"
          >
            <Trash2 aria-hidden className="size-4" />
            <span className="hidden sm:inline">Remove</span>
          </button>
        </div>
      </div>
    </article>
  )
}

function QuantityControl({
  value,
  atMin,
  atMax,
  cardName,
  onDecrement,
  onIncrement,
  onTextChange,
  onBlur,
}: {
  value: string
  atMin: boolean
  atMax: boolean
  cardName: string
  onDecrement: () => void
  onIncrement: () => void
  onTextChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <div className="inline-flex h-11 items-stretch overflow-hidden rounded-btn border border-border bg-surface">
      <button
        type="button"
        onClick={onDecrement}
        disabled={atMin}
        aria-label="Decrease quantity"
        className="grid w-11 place-items-center text-fg-muted transition-colors hover:bg-bg hover:text-fg disabled:opacity-40 touch-manipulation"
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onTextChange(e.target.value.replace(/\D/g, ''))}
        onBlur={onBlur}
        aria-label={`Quantity of ${cardName}`}
        className="w-11 border-x border-border bg-surface text-center text-sm font-bold text-fg focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={onIncrement}
        disabled={atMax}
        aria-label="Increase quantity"
        title={atMax ? 'No more in stock' : undefined}
        className="grid w-11 place-items-center text-fg-muted transition-colors hover:bg-bg hover:text-fg disabled:opacity-40 touch-manipulation"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  )
}
