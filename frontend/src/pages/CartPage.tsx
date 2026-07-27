import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  BadgeCheck,
  Boxes,
  CreditCard,
  ImageOff,
  Lock,
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
import type { CartItem, InventoryItem, Order, OrderFulfillment } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { inventoryKey, ordersKey, useCart, useDebouncedValue, useInventory, useKioskMode, useStore, useStoreTheme } from '../hooks'
import { customerKeys } from '../hooks/useCustomer'
import { Badge, Button, buttonVariants, EmptyState, Input, LoadingPanel } from '../components/ui'
import { SpotlightCard } from '../components/cards'
import { cx } from '../lib/cx'
import { FOIL_GRADIENT, rarityAccent } from '../lib/mtg'

const TEST_CHECKOUT_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_CHECKOUT === 'true'

function lineUnitCents(entry: CartItem): number {
  return entry.inventoryItem.priceCents
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

  const { query, setItem, removeItem, clear } = useCart(slug, Boolean(user))
  const { data: cart = [], isLoading } = query
  const [removed, setRemoved] = useState<RemovedLine | null>(null)
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null)
  const [fulfillment, setFulfillment] = useState<OrderFulfillment>('pickup')
  const { kioskMode } = useKioskMode()
  const [kioskCustomerName, setKioskCustomerName] = useState('')

  const testOrder = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Order>(`/stores/${slug}/customer/test-order`, {
        fulfillment: kioskMode ? 'pickup' : fulfillment,
        ...(kioskMode ? { channel: 'kiosk', customerName: kioskCustomerName.trim() } : {}),
      })
      return data
    },
    onSuccess: async (order) => {
      setCreatedOrder(order)
      setKioskCustomerName('')
      queryClient.setQueryData(customerKeys.cart(slug), [])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.cart(slug) }),
        queryClient.invalidateQueries({ queryKey: customerKeys.orders(slug) }),
        queryClient.invalidateQueries({ queryKey: ordersKey(slug) }),
        // Checkout consumes stock — refresh listings so counts are current.
        queryClient.invalidateQueries({ queryKey: inventoryKey(slug) }),
      ])
    },
  })

  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), 6500)
    return () => clearTimeout(timer)
  }, [removed])

  const { itemCount, subtotalCents, uniqueSets } = useMemo(() => {
    let itemCount = 0
    let subtotalCents = 0
    const sets = new Set<string>()

    for (const entry of cart) {
      itemCount += entry.quantity
      if (entry.inventoryItem.card.setCode) sets.add(entry.inventoryItem.card.setCode.toUpperCase())

      const unit = lineUnitCents(entry)
      subtotalCents += unit * entry.quantity
    }

    return { itemCount, subtotalCents, uniqueSets: sets.size }
  }, [cart])

  const subtotalLabel = formatPrice(subtotalCents)

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
    setRemoved({ item: entry.inventoryItem, quantity: entry.quantity })
    removeItem.mutate(entry.inventoryItem)
  }

  function handleUndo() {
    if (!removed) return
    setItem.mutate({ item: removed.item, quantity: removed.quantity })
    setRemoved(null)
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-border bg-surface shadow-card">
        <EmptyState
          icon={ShoppingCart}
          title="Sign in to view your cart"
          description="Your cart is saved to your account so it is here whenever you come back."
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
    <div className="space-y-8 pb-24 lg:pb-0">
      <p role="status" aria-live="polite" className="sr-only">
        {itemCount === 0
          ? 'Your cart is empty.'
          : `Cart updated. ${itemCount} item${itemCount === 1 ? '' : 's'}, estimated total ${subtotalLabel}.`}
      </p>

      <CartHeader
        slug={slug}
        storeName={store?.name ?? 'this store'}
        cartLength={cart.length}
        itemCount={itemCount}
        subtotalLabel={subtotalLabel}
        uniqueSets={uniqueSets}
        onClear={() => clear.mutate()}
        clearPending={clear.isPending}
      />

      {isLoading ? (
        <LoadingPanel label="Loading your cart..." />
      ) : cart.length === 0 ? (
        <EmptyCart slug={slug} storeName={store?.name ?? 'the store'} picks={picks} />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <ul className="space-y-3">
            {cart.map((entry) => (
              <CartLine
                key={entry.inventoryItem.id}
                entry={entry}
                slug={slug}
                onSetQuantity={(quantity) => setItem.mutate({ item: entry.inventoryItem, quantity })}
                onRemove={() => handleRemove(entry)}
              />
            ))}
          </ul>

          <OrderSummary
            slug={slug}
            storeName={store?.name ?? 'the store'}
            itemCount={itemCount}
            subtotalLabel={subtotalLabel}
            fulfillment={fulfillment}
            onFulfillmentChange={setFulfillment}
            kioskMode={kioskMode}
            kioskCustomerName={kioskCustomerName}
            onKioskCustomerNameChange={setKioskCustomerName}
            testCheckoutEnabled={TEST_CHECKOUT_ENABLED}
            testOrderPending={testOrder.isPending}
            testOrderError={testOrder.error}
            createdOrder={createdOrder}
            onCreateTestOrder={() => testOrder.mutate()}
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
            {TEST_CHECKOUT_ENABLED ? (
              <Button size="lg" loading={testOrder.isPending} onClick={() => testOrder.mutate()}>
                <PackageCheck aria-hidden className="size-4" />
                Test order
              </Button>
            ) : (
              <Button size="lg" disabled title="Checkout coming soon">
                <Lock aria-hidden className="size-4" />
                Checkout
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CartHeader({
  slug,
  storeName,
  cartLength,
  itemCount,
  subtotalLabel,
  uniqueSets,
  onClear,
  clearPending,
}: {
  slug: string
  storeName: string
  cartLength: number
  itemCount: number
  subtotalLabel: string
  uniqueSets: number
  onClear: () => void
  clearPending: boolean
}) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex flex-col gap-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={`/s/${slug}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
            <ArrowLeft aria-hidden className="size-4" />
            Continue shopping
          </Link>
          {cartLength > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} loading={clearPending} className="text-danger-700">
              <Trash2 aria-hidden className="size-4" />
              Clear cart
            </Button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Secure checkout preview</p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">Your cart</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted sm:text-base">
              Review quantities, verify printings, and keep browsing {storeName} before checkout opens.
            </p>
          </div>

          <div className="rounded-card border border-border bg-bg p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Estimated total</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-fg">{subtotalLabel}</p>
            <p className="mt-1 text-xs text-fg-muted">Shipping and tax are calculated at checkout.</p>
          </div>
        </div>
      </div>

      <div className="grid border-t border-border bg-bg/70 sm:grid-cols-3">
        <CartMetric icon={ShoppingCart} label="Cards" value={String(itemCount)} />
        <CartMetric icon={Boxes} label="Sets" value={String(uniqueSets)} />
        <CartMetric icon={BadgeCheck} label="Store" value={storeName} />
      </div>
    </section>
  )
}

function CartMetric({ icon: Icon, label, value }: { icon: typeof ShoppingCart; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-surface text-brand-600">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</p>
        <p className="truncate font-display text-lg font-bold text-fg">{value}</p>
      </div>
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
  storeName,
  itemCount,
  subtotalLabel,
  fulfillment,
  onFulfillmentChange,
  kioskMode = false,
  kioskCustomerName = '',
  onKioskCustomerNameChange,
  testCheckoutEnabled,
  testOrderPending,
  testOrderError,
  createdOrder,
  onCreateTestOrder,
}: {
  slug: string
  storeName: string
  itemCount: number
  subtotalLabel: string
  fulfillment: OrderFulfillment
  onFulfillmentChange: (value: OrderFulfillment) => void
  kioskMode?: boolean
  kioskCustomerName?: string
  onKioskCustomerNameChange?: (value: string) => void
  testCheckoutEnabled: boolean
  testOrderPending: boolean
  testOrderError: unknown
  createdOrder: Order | null
  onCreateTestOrder: () => void
}) {
  return (
    <aside className="rounded-card border border-border bg-surface p-5 shadow-card lg:sticky lg:top-20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-fg">Order summary</h2>
          <p className="mt-1 text-sm text-fg-muted">{itemCount} {itemCount === 1 ? 'card' : 'cards'} saved</p>
        </div>
        <span className="grid size-11 place-items-center rounded-btn bg-brand-50 text-brand-700">
          <PackageCheck aria-hidden className="size-5" />
        </span>
      </div>

      {kioskMode ? (
        <div className="mt-5">
          <Input
            label="Your name"
            value={kioskCustomerName}
            onChange={(e) => onKioskCustomerNameChange?.(e.target.value)}
            placeholder="So staff know whose order this is"
            maxLength={255}
          />
        </div>
      ) : (
        <fieldset className="mt-5 space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-fg-muted">How would you like to get it?</legend>
          <FulfillmentOption
            checked={fulfillment === 'pickup'}
            onSelect={() => onFulfillmentChange('pickup')}
            title="Pick up in store"
            text={`Free — grab it at ${storeName}.`}
          />
          <FulfillmentOption
            checked={fulfillment === 'shipping'}
            onSelect={() => onFulfillmentChange('shipping')}
            title="Ship to me"
            text="Shipping calculated at checkout."
          />
        </fieldset>
      )}

      <dl className="mt-5 space-y-3 text-sm">
        <SummaryRow label={`Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`} value={subtotalLabel} strong />
        <SummaryRow label="Shipping" value={fulfillment === 'pickup' ? 'Free — in-store pickup' : 'Calculated at checkout'} />
        <SummaryRow label="Taxes" value="Calculated at checkout" />
        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <dt className="font-bold text-fg">Estimated total</dt>
          <dd className="font-display text-3xl font-extrabold text-fg">{subtotalLabel}</dd>
        </div>
      </dl>

      {testCheckoutEnabled || kioskMode ? (
        <div className="mt-5 space-y-3">
          <Button
            className="w-full"
            size="lg"
            loading={testOrderPending}
            disabled={kioskMode && !kioskCustomerName.trim()}
            onClick={onCreateTestOrder}
          >
            <PackageCheck aria-hidden className="size-4" />
            {kioskMode ? 'Place kiosk order' : 'Create test order'}
          </Button>
          <p className="rounded-btn border border-warning-500/30 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-700">
            Local testing only. This creates a pending order from the cart without charging Square.
          </p>
          {Boolean(testOrderError) && (
            <p className="rounded-btn border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
              {extractErrorMessage(testOrderError, 'Could not create test order.')}
            </p>
          )}
          {createdOrder && (
            <Link to={`/s/${slug}/admin/orders`} className={`${buttonVariants({ variant: 'secondary', size: 'md' })} w-full`}>
              View {createdOrder.reference}
            </Link>
          )}
        </div>
      ) : (
        <Button className="mt-5 w-full" size="lg" disabled title="Checkout coming soon">
          <Lock aria-hidden className="size-4" />
          Checkout
        </Button>
      )}
      <Link to={`/s/${slug}`} className={`${buttonVariants({ variant: 'secondary', size: 'md' })} mt-2 w-full`}>
        Continue shopping
      </Link>

      <div className="mt-5 grid gap-3 border-t border-border pt-5">
        <TrustNote icon={ShieldCheck} title="Live inventory" text={`Stock counts come from ${storeName}'s current listings.`} />
        <TrustNote icon={CreditCard} title="No charge yet" text="Checkout is not enabled, so this is only a saved cart." />
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

function CartLine({
  entry,
  slug,
  onSetQuantity,
  onRemove,
}: {
  entry: CartItem
  slug: string
  onSetQuantity: (quantity: number) => void
  onRemove: () => void
}) {
  const item = entry.inventoryItem
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
        {image ? (
          <img src={image} alt={item.card.name} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-fg-muted">
            <ImageOff aria-hidden className="size-6" />
          </div>
        )}
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
                  Foil
                </span>
              ) : (
                <Badge tone="neutral">Nonfoil</Badge>
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
