import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { BellPlus, Check, CheckCircle2, ClipboardList, HelpCircle, LayoutGrid, List, Search, ShoppingCart, XCircle } from 'lucide-react'
import api, { cardImage, formatPrice, scryfallPriceCents } from '../api/client'
import type { InventoryItem } from '../api/types'
import { useInventory, useStore, useStoreCart, useStoreTheme } from '../hooks'
import { customerKeys } from '../hooks/useCustomer'
import { useAuth } from '../context/AuthContext'
import { Badge, BackButton, Button, Card, CardBody, CardHeader, EmptyState, Textarea } from '../components/ui'
import { CardImage } from '../components/cards'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { finishName } from '../lib/finishes'

/** One parsed request line: how many copies of which card name. */
interface RequestLine {
  raw: string
  name: string
  quantity: number
}

type LineStatus = 'found' | 'partial' | 'missing'

interface LineResult extends RequestLine {
  status: LineStatus
  /** Matching store listings, cheapest market price first. */
  listings: InventoryItem[]
  /** Copies the store can actually supply (≤ quantity). */
  fillable: number
  /** Cheapest-first cost of the fillable copies, in cents; null when unpriced. */
  fillCents: number | null
}

/**
 * Parse a pasted decklist. Accepts `4 Lightning Bolt`, `4x Lightning Bolt`, or
 * a bare card name (quantity 1); blank lines and `#`/`//` comments are skipped,
 * and a trailing `(SET) 123` printing hint is ignored. Duplicate names merge.
 */
function parseDecklist(text: string): RequestLine[] {
  const byName = new Map<string, RequestLine>()
  for (const rawLine of text.split('\n')) {
    const raw = rawLine.trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue
    const counted = /^(\d+)\s*[xX]?\s+(.+)$/.exec(raw)
    const quantity = counted ? Math.max(1, Number(counted[1])) : 1
    const name = (counted ? counted[2] : raw).replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w-]*\s*$/, '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) existing.quantity += quantity
    else byName.set(key, { raw, name, quantity })
  }
  return [...byName.values()]
}

function itemMarketCents(item: InventoryItem): number | null {
  return scryfallPriceCents(item.card, item.isFoil ? 'foil' : 'nonfoil')
}

/** Match one request line against inventory and price a cheapest-first fill. */
function matchLine(line: RequestLine, inventory: InventoryItem[]): LineResult {
  const wanted = line.name.toLowerCase()
  const listings = inventory
    .filter((item) => {
      const full = item.card.name.toLowerCase()
      return full === wanted || full.split(' // ')[0].trim() === wanted
    })
    .sort((a, b) => (itemMarketCents(a) ?? Number.POSITIVE_INFINITY) - (itemMarketCents(b) ?? Number.POSITIVE_INFINITY))

  let remaining = line.quantity
  let fillCents: number | null = 0
  for (const item of listings) {
    if (remaining <= 0) break
    const take = Math.min(remaining, item.quantity)
    const cents = itemMarketCents(item)
    if (fillCents !== null) fillCents = cents === null ? null : fillCents + cents * take
    remaining -= take
  }
  const fillable = line.quantity - remaining

  return {
    ...line,
    listings,
    fillable,
    fillCents: fillable > 0 ? fillCents : null,
    status: fillable >= line.quantity ? 'found' : fillable > 0 ? 'partial' : 'missing',
  }
}

const STATUS_META: Record<LineStatus, { label: string; tone: 'success' | 'warning' | 'danger'; icon: typeof CheckCircle2 }> = {
  found: { label: 'In stock', tone: 'success', icon: CheckCircle2 },
  partial: { label: 'Partial', tone: 'warning', icon: HelpCircle },
  missing: { label: 'Not in stock', tone: 'danger', icon: XCircle },
}

/** In-stock lines surface first so shoppers see what they can buy right away. */
const STATUS_ORDER: Record<LineStatus, number> = { found: 0, partial: 1, missing: 2 }

const PLACEHOLDER = ['4 Lightning Bolt', '2x Counterspell', 'Sol Ring', '# lines starting with # are ignored'].join('\n')

export default function MassSearchPage() {
  const { slug = '' } = useParams()
  const { data: store } = useStore(slug)
  useStoreTheme(store)

  const { data: inventory = [], isLoading } = useInventory(slug)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { query: cartQuery, setItem: cartSetItem } = useStoreCart(slug, Boolean(user))
  const [carted, setCarted] = useState<Set<string>>(new Set())
  const [wanted, setWanted] = useState<Set<string>>(new Set())

  /** Put the fillable copies in the cart, cheapest listings first. */
  function addFillToCart(result: LineResult) {
    let remaining = result.quantity
    const cart = cartQuery.data ?? []
    for (const item of result.listings) {
      if (remaining <= 0) break
      const inCart = cart.find((entry) => entry.inventoryItem?.id === item.id)?.quantity ?? 0
      const take = Math.min(remaining, Math.max(0, item.quantity - inCart))
      if (take > 0) {
        cartSetItem.mutate({ item, quantity: inCart + take })
        remaining -= take
      }
    }
    setCarted((current) => new Set(current).add(result.name.toLowerCase()))
  }

  /** Want-list the copies the store can't fill; restocks trigger a notification. */
  const addWant = useMutation({
    mutationFn: async (result: LineResult) => {
      const best = result.listings[0]
      await api.post(`/stores/${slug}/customer/want-list`, {
        cardId: best?.card.id,
        cardName: best?.card.name ?? result.name,
        setCode: best?.card.setCode ?? '',
        isFoil: false,
        quantity: Math.max(1, result.quantity - result.fillable),
        notes: 'Added from mass search',
      })
    },
    onSuccess: async (_data, result) => {
      setWanted((current) => new Set(current).add(result.name.toLowerCase()))
      await queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) })
    },
  })

  const lineActions = (result: LineResult) => (
    <LineActions
      result={result}
      signedIn={Boolean(user)}
      carted={carted.has(result.name.toLowerCase())}
      wanted={wanted.has(result.name.toLowerCase())}
      wantPending={addWant.isPending && addWant.variables?.name === result.name}
      onCart={() => addFillToCart(result)}
      onWant={() => addWant.mutate(result)}
    />
  )

  // A deck's "check availability" hand-off drops its list here (one-shot).
  const [text, setText] = useState(() => {
    try {
      const prefill = sessionStorage.getItem('mass-search-prefill')
      if (prefill) {
        sessionStorage.removeItem('mass-search-prefill')
        return prefill
      }
    } catch {
      // Storage unavailable — start empty.
    }
    return ''
  })
  const [submitted, setSubmitted] = useState<RequestLine[] | null>(null)
  const [view, setView] = useState<'list' | 'grid'>('list')

  const results = useMemo(() => {
    if (!submitted) return null
    return submitted
      .map((line) => matchLine(line, inventory))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  }, [submitted, inventory])

  const summary = useMemo(() => {
    if (!results) return null
    const counts = { found: 0, partial: 0, missing: 0 } as Record<LineStatus, number>
    let totalCents = 0
    let priced = true
    for (const r of results) {
      counts[r.status] += 1
      if (r.fillCents === null) {
        if (r.fillable > 0) priced = false
      } else {
        totalCents += r.fillCents
      }
    }
    return { counts, totalCents, priced }
  }, [results])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to={`/s/${slug}`}>Back to {store?.name ?? 'store'}</BackButton>
      </div>

      <div>
        <h1 className="inline-flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-fg">
          <span className="grid size-10 place-items-center rounded-btn bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <ClipboardList aria-hidden className="size-5" />
          </span>
          Mass Search
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Paste a decklist or want list and see what {store?.name ?? 'this store'} has in stock — with an estimated
          total at market prices.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
        {/* Input */}
        <Card className="lg:sticky lg:top-20">
          <CardHeader title="Your list" subtitle="One card per line. Quantities like “4x” are optional." />
          <CardBody className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={14}
              className="font-mono text-sm"
              aria-label="Card list"
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setSubmitted(parseDecklist(text))} disabled={!text.trim() || isLoading}>
                <Search aria-hidden className="size-4" />
                Search list
              </Button>
              {submitted && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setText('')
                    setSubmitted(null)
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-4">
          {isLoading ? (
            <StorePageLoader label="Loading inventory…" />
          ) : !results ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={ClipboardList}
                  title="Paste a list to get started"
                  description="We’ll match every line against this store’s live inventory."
                />
              </CardBody>
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState icon={Search} title="Nothing to search" description="No card names found in your list." />
              </CardBody>
            </Card>
          ) : (
            <>
              {/* Summary strip */}
              {summary && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="success">{summary.counts.found} in stock</Badge>
                    <Badge tone="warning">{summary.counts.partial} partial</Badge>
                    <Badge tone="danger">{summary.counts.missing} missing</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-fg-muted">
                      Estimated total{' '}
                      <span className="font-display text-xl font-bold text-fg">
                        {formatPrice(summary.totalCents)}
                        {summary.priced ? '' : '+'}
                      </span>
                    </p>
                    <div className="inline-flex overflow-hidden rounded-btn border border-border" role="group" aria-label="Result layout">
                      <button
                        type="button"
                        onClick={() => setView('list')}
                        aria-pressed={view === 'list'}
                        aria-label="List view"
                        className={`grid size-9 place-items-center transition-colors ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg'}`}
                      >
                        <List aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setView('grid')}
                        aria-pressed={view === 'grid'}
                        aria-label="Grid view"
                        className={`grid size-9 place-items-center border-l border-border transition-colors ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg'}`}
                      >
                        <LayoutGrid aria-hidden className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {view === 'grid' ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  {results.map((result) => (
                    <ResultTile key={result.name.toLowerCase()} result={result} slug={slug} actions={lineActions(result)} />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {results.map((result) => (
                    <ResultRow key={result.name.toLowerCase()} result={result} slug={slug} actions={lineActions(result)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Per-line actions: put the in-stock copies in the cart; want-list the rest
 * (or all of a missing card) — restocks notify the customer automatically.
 */
function LineActions({
  result,
  signedIn,
  carted,
  wanted,
  wantPending,
  onCart,
  onWant,
}: {
  result: LineResult
  signedIn: boolean
  carted: boolean
  wanted: boolean
  wantPending: boolean
  onCart: () => void
  onWant: () => void
}) {
  const missing = result.quantity - result.fillable

  return (
    <div className="flex flex-wrap items-center gap-2">
      {result.fillable > 0 &&
        (carted ? (
          <Badge tone="success">
            <Check aria-hidden className="size-3" /> In cart
          </Badge>
        ) : (
          <Button size="sm" onClick={onCart}>
            <ShoppingCart aria-hidden className="size-4" />
            Add {result.fillable} to cart
          </Button>
        ))}
      {signedIn &&
        missing > 0 &&
        (wanted ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700">
            <Check aria-hidden className="size-3.5" />
            On your want list — we'll notify you when it's in stock
          </span>
        ) : (
          <Button size="sm" variant="secondary" loading={wantPending} onClick={onWant}>
            <BellPlus aria-hidden className="size-4" />
            {result.fillable > 0 ? `Want-list the other ${missing}` : 'Add to want list'}
          </Button>
        ))}
    </div>
  )
}

function ResultRow({ result, slug, actions }: { result: LineResult; slug: string; actions?: React.ReactNode }) {
  const meta = STATUS_META[result.status]
  const Icon = meta.icon
  const best = result.listings[0]
  const image = best ? cardImage(best.card) : null

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {best && (
            <Link to={`/s/${slug}/cards/${best.id}`} className="shrink-0">
              {image ? (
                <img
                  src={image}
                  alt={best.card.name}
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-12 rounded object-cover shadow-sm"
                />
              ) : (
                <span className="grid h-16 w-12 place-items-center rounded bg-bg text-[0.6rem] text-fg-muted">—</span>
              )}
            </Link>
          )}
          <Icon
            aria-hidden
            className={`size-5 flex-shrink-0 ${
              meta.tone === 'success' ? 'text-success-700' : meta.tone === 'warning' ? 'text-warning-700' : 'text-danger-700'
            }`}
          />
          <div className="min-w-0">
            {best ? (
              <Link to={`/s/${slug}/cards/${best.id}`} className="truncate font-bold text-fg hover:text-brand-600 hover:underline">
                {best.card.name}
              </Link>
            ) : (
              <p className="truncate font-bold text-fg">{result.name}</p>
            )}
            <p className="text-xs text-fg-muted">
              {result.quantity} requested · {result.fillable} available
              {result.fillCents !== null ? ` · ${formatPrice(result.fillCents)}` : ''}
            </p>
          </div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {result.listings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {result.listings.map((item) => {
            const cents = itemMarketCents(item)
            return (
              <Link
                key={item.id}
                to={`/s/${slug}/cards/${item.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-brand-500 hover:text-brand-600"
              >
                <span className="font-bold text-fg">{item.card.setCode?.toUpperCase() ?? '—'}</span>
                {item.condition}
                {item.isFoil ? ` · ${finishName(item.card, true, item.finish)}` : ''} · {item.quantity} in stock
                {cents !== null ? ` · ${formatPrice(cents)}` : ''}
              </Link>
            )
          })}
        </div>
      )}

      {actions && <div className="mt-3 border-t border-border pt-3">{actions}</div>}
    </div>
  )
}

/** Grid view: an image-first tile per requested line, status badge on the art. */
function ResultTile({ result, slug, actions }: { result: LineResult; slug: string; actions?: React.ReactNode }) {
  const meta = STATUS_META[result.status]
  const best = result.listings[0]
  const image = best ? cardImage(best.card) : null
  const body = (
    <>
      <div className="relative aspect-[5/7] overflow-hidden rounded-[4.5%/3.5%] bg-bg shadow-card">
        <span className="absolute left-1.5 top-1.5 z-10">
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </span>
        <CardImage src={image} alt={best?.card.name ?? result.name} className="h-full w-full" label={result.name} />
      </div>
      <div className="mt-2 px-0.5">
        <h4 className="truncate text-sm font-bold text-fg group-hover:text-brand-600">{best?.card.name ?? result.name}</h4>
        <p className="mt-0.5 text-xs text-fg-muted">
          {result.quantity} requested · {result.fillable} available
          {result.fillCents !== null ? ` · ${formatPrice(result.fillCents)}` : ''}
        </p>
      </div>
    </>
  )

  if (!best) {
    return (
      <div>
        <div className="opacity-75">{body}</div>
        {actions && <div className="mt-2 px-0.5">{actions}</div>}
      </div>
    )
  }

  return (
    <div>
      <Link
        to={`/s/${slug}/cards/${best.id}`}
        className="group block rounded-card transition-transform duration-150 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {body}
      </Link>
      {actions && <div className="mt-2 px-0.5">{actions}</div>}
    </div>
  )
}
