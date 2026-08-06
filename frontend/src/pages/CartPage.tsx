import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  CreditCard,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, scryfallPriceCents } from '../api/client'
import type { CartItem, InventoryItem, Order, OrderFulfillment, SealedInventoryLine, StoreCreditSummary } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { inventoryKey, ordersKey, useDebouncedValue, useInventory, useKioskMode, useStore, useStoreCart, useStoreTheme } from '../hooks'
import { customerKeys } from '../hooks/useCustomer'
import { guestCartKey, guestCartLines, resetGuestCart } from '../hooks/useGuestCart'
import { BackButton, Badge, Button, buttonVariants, EmptyState, Input } from '../components/ui'
import { CheckoutPanel } from '../components/payments/CheckoutPanel'
import { CardImage, SpotlightCard } from '../components/cards'
import { cx } from '../lib/cx'
import { finishName } from '../lib/finishes'
import { FOIL_GRADIENT, rarityAccent } from '../lib/mtg'
import { StorePageLoader } from '../components/store/StorePageLoader'

import { showDevCheckoutTools } from '../lib/runtimeEnv'

const TEST_CHECKOUT_ENABLED = showDevCheckoutTools

function lineUnitCents(entry: CartItem): number {
  return entry.sealedItem?.priceCents ?? entry.inventoryItem?.priceCents ?? 0
}

interface RemovedLine {
  item: InventoryItem
  quantity: number
}

export default function CartPage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  useStoreTheme(store)

  const isGuest = !user
  const { query, setItem, removeItem, setSealedItem, removeSealedItem, clear } = useStoreCart(slug, Boolean(user))
  const { data: cart = [], isLoading } = query
  const [removed, setRemoved] = useState<RemovedLine | null>(null)
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null)
  const [fulfillment, setFulfillment] = useState<OrderFulfillment>('pickup')
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
    queryKey: ['store-checkout-config', slug],
    enabled: Boolean(slug && !kioskMode),
    queryFn: async () => {
      const { data } = await api.get<{ enabled: boolean }>(`/stores/${slug}/customer/checkout/config`)
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
        queryClient.invalidateQueries({ queryKey: customerKeys.orders(slug) }),
        queryClient.invalidateQueries({ queryKey: ordersKey(slug) }),
        queryClient.invalidateQueries({ queryKey: inventoryKey(slug) }),
        queryClient.invalidateQueries({ queryKey: ['store-credit', slug] }),
      ])
    },
    [queryClient, slug, isGuest],
  )

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

  const checkoutPath = isGuest ? `/stores/${slug}/guest/checkout` : `/stores/${slug}/customer/checkout`
  const checkoutBody = useMemo(
    () => ({
      fulfillment: kioskMode ? 'pickup' : fulfillment,
      customerName: (kioskMode ? kioskCustomerName : contactName).trim(),
      customerEmail: contactEmail.trim() || undefined,
      ...(isGuest ? { lines: guestCartLines(cart) } : { useStoreCredit: useCredit }),
    }),
    [cart, contactEmail, contactName, fulfillment, isGuest, kioskCustomerName, kioskMode, slug, useCredit],
  )
  const paymentReady = Boolean((kioskMode ? kioskCustomerName : contactName).trim())

  const { data: inventory = [] } = useInventory(slug)
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
    <div className="space-y-6 pb-24 lg:pb-8">
      <p role="status" aria-live="polite" className="sr-only">
        {itemCount === 0
          ? 'Your cart is empty.'
          : `Cart updated. ${itemCount} item${itemCount === 1 ? '' : 's'}, estimated total ${subtotalLabel}.`}
      </p>

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <BackButton to={`/s/${slug}`}>Continue shopping</BackButton>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Checkout</h1>
          <p className="mt-1 text-sm text-fg-muted">{store?.name ?? 'Store'}</p>
        </div>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => clear.mutate()} loading={clear.isPending} className="text-fg-muted">
            <Trash2 aria-hidden className="size-4" />
            Clear cart
          </Button>
        )}
      </header>

      {isLoading ? (
        <StorePageLoader label="Loading your cart…" />
      ) : cart.length === 0 ? (
        <EmptyCart slug={slug} storeName={store?.name ?? 'the store'} picks={picks} />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-8">
            {!kioskMode && (
              <section className="rounded-card border border-border bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-fg">Contact</h2>
                  {isGuest && (
                    <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
                      Log in
                    </Link>
                  )}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="For pickup or your order"
                    maxLength={255}
                    required
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={isGuest ? 'Receipt & updates (optional)' : 'Receipt email'}
                    maxLength={255}
                  />
                </div>
              </section>
            )}

            {!kioskMode && (
              <fieldset className="rounded-card border border-border bg-surface p-5 shadow-card">
                <legend className="px-1 text-base font-bold text-fg">Delivery</legend>
                <div className="mt-4 space-y-2">
                  <FulfillmentOption
                    checked={fulfillment === 'pickup'}
                    onSelect={() => setFulfillment('pickup')}
                    title="Pick up in store"
                    text={`Free — grab it at ${store?.name ?? 'the store'}.`}
                  />
                  <FulfillmentOption
                    checked={fulfillment === 'shipping'}
                    onSelect={() => setFulfillment('shipping')}
                    title="Ship to me"
                    text="Shipping calculated at checkout."
                  />
                </div>
              </fieldset>
            )}

            <section>
              <h2 className="mb-3 text-base font-bold text-fg">Items</h2>
              <ul className="space-y-3">
            {cart.map((entry) =>
              entry.sealedItem ? (
                <SealedCartLine
                  key={`sealed-${entry.sealedItem.id}`}
                  entry={entry}
                  sealed={entry.sealedItem}
                  onSetQuantity={(quantity) =>
                    setSealedItem.mutate({ item: entry.sealedItem!, quantity })
                  }
                  onRemove={() => handleRemove(entry)}
                />
              ) : entry.inventoryItem ? (
                <CartLine
                  key={entry.inventoryItem.id}
                  entry={entry}
                  slug={slug}
                  item={entry.inventoryItem}
                  onSetQuantity={(quantity) => setItem.mutate({ item: entry.inventoryItem!, quantity })}
                  onRemove={() => handleRemove(entry)}
                />
              ) : null,
            )}
              </ul>
            </section>
          </div>

          <OrderSummary
            slug={slug}
            storeName={store?.name ?? 'the store'}
            itemCount={itemCount}
            subtotalLabel={subtotalLabel}
            kioskMode={kioskMode}
            creditBalanceCents={creditBalanceCents}
            useCredit={useCredit}
            onUseCreditChange={setUseCredit}
            subtotalCents={subtotalCents}
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
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-xl lg:bottom-6"
        >
          <p className="min-w-0 truncate text-sm text-fg">
            Removed <span className="font-bold">{removed.item.card.name}</span>
          </p>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand-600 hover:underline"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Undo
          </button>
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.25)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Estimated total</p>
              <p className="font-display text-xl font-bold text-fg">{subtotalLabel}</p>
            </div>
            {/* The payment form lives in the summary panel, which is below the
                lines on mobile — jump to it rather than duplicating it here. */}
            <a href="#order-summary" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
              <PackageCheck aria-hidden className="size-4" />
              Checkout
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyCart({ slug, storeName, picks }: { slug: string; storeName: string; picks: InventoryItem[] }) {
  return (
    <div className="space-y-10">
      <div className="rounded-card border border-border bg-surface shadow-card">
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
      </div>

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
  kioskCustomerName = '',
  onKioskCustomerNameChange,
  buyerEmail,
  checkoutPath,
  checkoutBody,
  paymentReady,
  isGuest = false,
  testCheckoutEnabled,
  testOrderPending,
  testOrderError,
  createdOrder,
  onCreateTestOrder,
  onOrderPlaced,
}: {
  slug: string
  storeName: string
  itemCount: number
  subtotalLabel: string
  fulfillment: OrderFulfillment
  kioskMode?: boolean
  creditBalanceCents?: number
  useCredit?: boolean
  onUseCreditChange?: (value: boolean) => void
  subtotalCents?: number
  kioskCustomerName?: string
  onKioskCustomerNameChange?: (value: string) => void
  buyerEmail: string
  checkoutPath: string
  checkoutBody: Record<string, unknown>
  paymentReady: boolean
  isGuest?: boolean
  testCheckoutEnabled: boolean
  testOrderPending: boolean
  testOrderError: unknown
  createdOrder: Order | null
  onCreateTestOrder: () => void
  onOrderPlaced: (order: Order) => void
}) {
  const creditApplied = !kioskMode && !isGuest && useCredit ? Math.min(creditBalanceCents, subtotalCents) : 0
  return (
    <aside id="order-summary" className="scroll-mt-20 rounded-card border border-border bg-bg/80 p-5 shadow-card lg:sticky lg:top-20">
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

      <dl className="mt-5 space-y-3 text-sm">
        <SummaryRow label={`Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`} value={subtotalLabel} strong />
        <SummaryRow label="Shipping" value={fulfillment === 'pickup' ? 'Free — in-store pickup' : 'Calculated at checkout'} />
        <SummaryRow label="Taxes" value="Calculated at checkout" />
        {creditApplied > 0 && <SummaryRow label="Store credit" value={`−${formatPrice(creditApplied)}`} />}
        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <dt className="font-bold text-fg">Total due today</dt>
          <dd className="font-display text-3xl font-extrabold text-fg">
            {creditApplied > 0 ? formatPrice(Math.max(0, subtotalCents - creditApplied)) : subtotalLabel}
          </dd>
        </div>
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
          amountDueCents={subtotalCents - creditApplied}
          buyerEmail={buyerEmail}
          checkoutPath={checkoutPath}
          checkoutBody={checkoutBody}
          paymentReady={paymentReady}
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
            Developer shortcut — places an order without charging a card.
          </p>
        </div>
      )}

      {Boolean(testOrderError) && (
        <p className="mt-3 rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {extractErrorMessage(testOrderError, 'Could not create order.')}
        </p>
      )}

      {createdOrder && (
        <Link to={`/s/${slug}/admin/orders`} className={`${buttonVariants({ variant: 'secondary', size: 'md' })} mt-3 w-full`}>
          View {createdOrder.reference}
        </Link>
      )}

      <Link to={`/s/${slug}`} className={`${buttonVariants({ variant: 'secondary', size: 'md' })} mt-2 w-full`}>
        Continue shopping
      </Link>

      <div className="mt-5 grid gap-3 border-t border-border pt-5">
        <TrustNote icon={ShieldCheck} title="Live inventory" text="Stock is reserved when you pay." />
        <TrustNote icon={CreditCard} title="Secure payments" text="Card details go straight to Square and never reach our servers." />
      </div>
    </aside>
  )
}

function FulfillmentOption({
  checked,
  onSelect,
  title,
  text,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  text: string
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-btn border p-3 transition-colors',
        checked ? 'border-brand-500 bg-brand-50/60' : 'border-border bg-surface hover:bg-bg',
      )}
    >
      <input
        type="radio"
        name="fulfillment"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 accent-[var(--color-brand-600,currentColor)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-fg">{title}</span>
        <span className="block text-xs leading-5 text-fg-muted">{text}</span>
      </span>
    </label>
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

function TrustNote({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-btn bg-bg text-success-700">
        <Icon aria-hidden className="size-4" />
      </span>
      <div>
        <p className="text-sm font-bold text-fg">{title}</p>
        <p className="text-xs leading-5 text-fg-muted">{text}</p>
      </div>
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
    <li className="grid gap-4 rounded-card border border-border bg-surface p-4 shadow-card sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:p-5">
      <div className="grid h-40 w-28 place-items-center overflow-hidden rounded-btn border border-border bg-bg sm:h-36 sm:w-full">
        <CardImage
          src={product?.imageUrl}
          alt={product?.name ?? 'Sealed product'}
          fit="contain"
          className="size-full"
        />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-xl font-extrabold leading-snug tracking-tight text-fg [overflow-wrap:anywhere]">
              {product?.name ?? 'Sealed product'}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-fg-muted">
              {[product?.gameName ?? product?.gameCode, product?.setName].filter(Boolean).join(' / ') || 'Sealed'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="brand">Sealed</Badge>
              {sealed.quantity <= 3 && <Badge tone="warning">Low stock</Badge>}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Line total</p>
            <p className="font-display text-2xl font-extrabold text-fg">{linePrice}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-btn border border-border">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={entry.quantity <= 1}
              aria-label="Decrease quantity"
              className="px-3 py-1.5 text-fg-muted disabled:opacity-40 hover:text-fg"
            >
              −
            </button>
            <span className="min-w-10 px-2 text-center text-sm font-bold text-fg">{entry.quantity}</span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={atMax}
              aria-label="Increase quantity"
              className="px-3 py-1.5 text-fg-muted disabled:opacity-40 hover:text-fg"
            >
              +
            </button>
          </div>
          <span className="text-sm text-fg-muted">{formatPrice(sealed.priceCents)} each</span>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
    </li>
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
    <li className="grid gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-[0_16px_40px_-18px_rgb(16_24_40/0.28)] sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:p-5">
      <Link
        to={`/s/${slug}/cards/${item.id}`}
        className={cx('relative h-40 w-28 overflow-hidden rounded-btn border-2 bg-bg sm:h-36 sm:w-full', item.isFoil && 'foil-card')}
        style={{ borderColor: accent }}
      >
        <CardImage src={image} alt={item.card.name} className="size-full" />
        {item.isFoil && (
          <span
            aria-hidden
            className="foil-shimmer pointer-events-none absolute inset-0"
          />
        )}
      </Link>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              to={`/s/${slug}/cards/${item.id}`}
              className="font-display text-xl font-extrabold leading-snug tracking-tight text-fg hover:text-brand-600 [overflow-wrap:anywhere]"
            >
              {item.card.name}
            </Link>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-fg-muted">
              {item.card.setName ?? item.card.setCode?.toUpperCase() ?? '-'} / #{item.card.collectorNumber ?? '-'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{item.condition}</Badge>
              {item.isFoil ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-white/60 px-2.5 py-0.5 text-xs font-bold text-black/80"
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

          <div className="text-left sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Line total</p>
            <p className="font-display text-2xl font-extrabold text-fg">{linePrice}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
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
            <p className="text-xs leading-5 text-fg-muted">
              <span className="font-bold text-fg">{formatPrice(unit)} each</span>
              <span aria-hidden> / </span>
              <span className={cx(atMax && 'font-bold text-warning-700')}>
                {atMax ? `Only ${item.quantity} in stock` : `${item.quantity} in stock`}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="inline-flex w-fit items-center gap-1.5 rounded-btn px-2 py-1.5 text-sm font-bold text-fg-muted transition-colors hover:bg-danger-50 hover:text-danger-700"
          >
            <Trash2 aria-hidden className="size-4" />
            Remove
          </button>
        </div>
      </div>
    </li>
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
    <div className="inline-flex h-10 items-stretch overflow-hidden rounded-btn border border-border bg-surface">
      <button
        type="button"
        onClick={onDecrement}
        disabled={atMin}
        aria-label="Decrease quantity"
        className="grid w-10 place-items-center text-fg-muted transition-colors hover:bg-bg hover:text-fg disabled:opacity-40"
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
        className="w-12 border-x border-border bg-surface text-center text-sm font-bold text-fg focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={onIncrement}
        disabled={atMax}
        aria-label="Increase quantity"
        title={atMax ? 'No more in stock' : undefined}
        className="grid w-10 place-items-center text-fg-muted transition-colors hover:bg-bg hover:text-fg disabled:opacity-40"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  )
}
