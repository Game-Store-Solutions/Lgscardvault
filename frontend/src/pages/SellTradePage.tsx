import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, scryfallPriceCents } from '../api/client'
import type { BuylistEntry, CardSummary, SellPayoutMethod, SellSubmission, TradeRates } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { useDebouncedValue, useKioskMode, useStore, useStoreTheme } from '../hooks'
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  LoadingPanel,
  Modal,
  Select,
  Textarea,
} from '../components/ui'
import { formatDate } from '../lib/format'
import { TradePromoBanner } from '../components/store/TradePromoBanner'
import { StorePageLoader } from '../components/store/StorePageLoader'

const buylistKey = (slug: string) => ['buylist', slug] as const
const tradeRatesKey = (slug: string) => ['trade-rates', slug] as const
const mySubmissionsKey = (slug: string) => ['my-sell-submissions', slug] as const

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const
type Condition = (typeof CONDITIONS)[number]

const STATUS_TONE: Record<SellSubmission['status'], 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

/** One card the customer is offering to sell. Buy-list lines carry their entry. */
interface SellLine {
  key: string
  card: CardSummary
  entry: BuylistEntry | null
  isFoil: boolean
  condition: Condition
  quantity: number
}

function lineKey(card: CardSummary, entry: BuylistEntry | null, isFoil: boolean, condition: Condition): string {
  return entry ? `entry:${entry.id}:${condition}` : `card:${card.id}:${isFoil ? 'f' : 'n'}:${condition}`
}

function lineMarketCents(line: SellLine): number | null {
  return scryfallPriceCents(line.card, line.isFoil ? 'foil' : 'nonfoil')
}

/**
 * Per-copy payout for a line: a buy-list entry's pinned offer wins; otherwise
 * the applicable rate (premium for buy-list lines) × market price, floored to
 * whole cents — the same math the backend snapshots at submission time.
 */
function lineOfferCents(line: SellLine, rates: TradeRates, method: SellPayoutMethod): number | null {
  if (line.entry && line.entry.offerCents != null) return line.entry.offerCents
  const market = lineMarketCents(line)
  if (market == null) return null
  const percent = line.entry
    ? method === 'credit'
      ? rates.buylistCreditPercent
      : rates.buylistCashPercent
    : method === 'credit'
      ? rates.creditPercent
      : rates.cashPercent
  return Math.floor((market * percent) / 100)
}

/** Parse a pasted decklist: `4 Lightning Bolt`, `4x ...`, or bare names. */
function parseDecklist(text: string): Map<string, number> {
  const byName = new Map<string, number>()
  for (const rawLine of text.split('\n')) {
    const raw = rawLine.trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue
    const counted = /^(\d+)\s*[xX]?\s+(.+)$/.exec(raw)
    const quantity = counted ? Math.max(1, Number(counted[1])) : 1
    const name = (counted ? counted[2] : raw).replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w-]*\s*$/, '').trim().toLowerCase()
    if (!name) continue
    byName.set(name, (byName.get(name) ?? 0) + quantity)
  }
  return byName
}

function matchesName(card: CardSummary, wanted: string): boolean {
  const full = card.name.toLowerCase()
  return full === wanted || full.split(' // ')[0].trim() === wanted
}

/**
 * Sell/Trade portal: sell any card at a percentage of market price (store
 * credit or cash), with premium rates on the store's buy list. Build the
 * list by search, bulk paste, or the buy-list grid; the store confirms the
 * offer before you bring the cards in. On a kiosk terminal, staff submit
 * with the walk-up customer's name.
 */
export default function SellTradePage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const { kioskMode } = useKioskMode()
  const { data: store, isLoading: storeLoading } = useStore(slug)
  useStoreTheme(store)
  const queryClient = useQueryClient()

  const { data: rates } = useQuery({
    queryKey: tradeRatesKey(slug),
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<TradeRates>(`/stores/${slug}/trade-rates`)
      return data
    },
  })

  const { data: buylist = [], isLoading: buylistLoading } = useQuery({
    queryKey: buylistKey(slug),
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<BuylistEntry[]>(`/stores/${slug}/buylist`)
      return data
    },
  })

  const submissionsQuery = useQuery({
    queryKey: mySubmissionsKey(slug),
    enabled: Boolean(slug && user),
    queryFn: async () => {
      const { data } = await api.get<SellSubmission[]>(`/stores/${slug}/customer/sell-submissions`)
      return data
    },
  })

  const [lines, setLines] = useState<SellLine[]>([])
  const [payoutMethod, setPayoutMethod] = useState<SellPayoutMethod>('credit')
  const [kioskCustomerName, setKioskCustomerName] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Card search (any card, not just the buy list)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm, 350)
  const searchQuery = useQuery({
    queryKey: ['sell-card-search', debouncedSearch],
    enabled: Boolean(user) && debouncedSearch.trim().length >= 2,
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', { params: { q: debouncedSearch.trim() } })
      return data
    },
  })

  // Bulk paste
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [unmatched, setUnmatched] = useState<string[]>([])

  // "Change printing" target line
  const [printingLine, setPrintingLine] = useState<SellLine | null>(null)

  const effectiveRates = useMemo<TradeRates>(
    () =>
      rates ?? {
        creditPercent: 0,
        cashPercent: 0,
        buylistCreditPercent: 0,
        buylistCashPercent: 0,
        promoActive: false,
        promoEndsAt: null,
      },
    [rates],
  )

  const totals = useMemo(() => {
    let market = 0
    let offer = 0
    let buylistOffer = 0
    let unpriced = 0
    for (const line of lines) {
      const m = lineMarketCents(line)
      const o = lineOfferCents(line, effectiveRates, payoutMethod)
      if (o == null) {
        unpriced += 1
        continue
      }
      market += (m ?? 0) * line.quantity
      offer += o * line.quantity
      if (line.entry) buylistOffer += o * line.quantity
    }
    return { market, offer, buylistOffer, unpriced }
  }, [lines, effectiveRates, payoutMethod])

  const cardCount = lines.reduce((n, line) => n + line.quantity, 0)

  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SellSubmission>(`/stores/${slug}/sell-submissions`, {
        payoutMethod,
        ...(kioskMode ? { channel: 'kiosk', customerName: kioskCustomerName.trim() } : {}),
        items: lines.map((line) =>
          line.entry
            ? { buylistEntryId: line.entry.id, quantity: line.quantity, condition: line.condition }
            : { cardId: line.card.id, quantity: line.quantity, condition: line.condition, isFoil: line.isFoil },
        ),
      })
      return data
    },
    onSuccess: async () => {
      setLines([])
      setKioskCustomerName('')
      setReviewOpen(false)
      setSubmitted(true)
      await queryClient.invalidateQueries({ queryKey: mySubmissionsKey(slug) })
    },
  })

  function addLine(card: CardSummary, entry: BuylistEntry | null, isFoil: boolean, condition: Condition, quantity: number) {
    const key = lineKey(card, entry, isFoil, condition)
    setLines((current) => {
      const cap = entry?.maxQuantity ?? Number.POSITIVE_INFINITY
      const existing = current.find((line) => line.key === key)
      if (existing) {
        return current.map((line) => (line.key === key ? { ...line, quantity: Math.min(line.quantity + quantity, cap) } : line))
      }
      return [...current, { key, card, entry, isFoil, condition, quantity: Math.min(quantity, cap) }]
    })
    setSubmitted(false)
  }

  function updateLine(key: string, patch: Partial<Pick<SellLine, 'quantity' | 'condition' | 'card' | 'isFoil'>>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line
        const next = { ...line, ...patch }
        next.key = lineKey(next.card, next.entry, next.isFoil, next.condition)
        return next
      }),
    )
  }

  /** Resolve pasted names against the catalog, cheapest priced printing first. */
  async function importBulk() {
    const wanted = parseDecklist(bulkText)
    if (wanted.size === 0) return
    setBulkBusy(true)
    const misses: string[] = []
    try {
      const names = [...wanted.entries()]
      for (let i = 0; i < names.length; i += 4) {
        await Promise.all(
          names.slice(i, i + 4).map(async ([name, quantity]) => {
            try {
              const { data } = await api.get<CardSummary[]>('/catalog/search', { params: { q: name } })
              const priced = data
                .filter((card) => matchesName(card, name) && scryfallPriceCents(card, 'nonfoil') != null)
                .sort((a, b) => (scryfallPriceCents(a, 'nonfoil') ?? 0) - (scryfallPriceCents(b, 'nonfoil') ?? 0))
              if (priced.length > 0) addLine(priced[0], null, false, 'NM', quantity)
              else misses.push(name)
            } catch {
              misses.push(name)
            }
          }),
        )
      }
    } finally {
      setUnmatched(misses)
      setBulkText('')
      setBulkOpen(false)
      setBulkBusy(false)
    }
  }

  const creditPercent = effectiveRates.creditPercent
  const cashPercent = effectiveRates.cashPercent
  const showBuylistBonus =
    effectiveRates.buylistCreditPercent > creditPercent || effectiveRates.buylistCashPercent > cashPercent

  const summaryPanel = (
    <SummaryPanel
      lines={lines}
      rates={effectiveRates}
      payoutMethod={payoutMethod}
      onPayoutMethod={setPayoutMethod}
      totals={totals}
      onUpdateLine={updateLine}
      onRemoveLine={(key) => setLines((current) => current.filter((line) => line.key !== key))}
      onChangePrinting={(line) => setPrintingLine(line)}
      onClear={() => setLines([])}
      kioskMode={kioskMode}
      kioskCustomerName={kioskCustomerName}
      onKioskCustomerName={setKioskCustomerName}
      user={Boolean(user)}
      storeName={store?.name ?? 'store'}
      submit={submit}
    />
  )

  // Full-screen branded loader only while the screen isn't completely
  // loaded — cached revisits render instantly.
  if (storeLoading || buylistLoading) {
    return <StorePageLoader label="Loading sell & trade…" />
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Link to={`/s/${slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Back to {store?.name ?? 'store'}
      </Link>

      <div>
        <h1 className="inline-flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-fg">
          <span className="grid size-10 place-items-center rounded-btn bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <WalletCards aria-hidden className="size-5" />
          </span>
          Sell / Trade
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          {store?.name ?? 'This store'} pays{' '}
          <strong className="text-fg">{cashPercent}% cash</strong> or{' '}
          <strong className="text-fg">{creditPercent}% store credit</strong> of market price for your cards
          {showBuylistBonus ? ' — with premium rates on the buy list below' : ''}. Build your list and submit it; the
          store confirms every offer in person.
        </p>
      </div>

      <TradePromoBanner slug={slug} />

      {submitted && (
        <Card className="border-success-500/40">
          <CardBody className="space-y-2 text-center">
            <BadgeCheck aria-hidden className="mx-auto size-10 text-success-600" />
            <h2 className="font-display text-xl font-bold text-fg">Submission received!</h2>
            <p className="mx-auto max-w-lg text-sm text-fg-muted">
              Bring your cards to the counter — staff will verify names and conditions before paying out. All offers
              are subject to final approval on inspection.
            </p>
            <Button variant="secondary" onClick={() => setSubmitted(false)}>
              Start a new list
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-6">
          {/* Find cards */}
          <Card>
            <CardHeader title="Find your cards" subtitle="Search any card to see what we pay, or paste a whole list." />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <Input
                    label="Card name"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Lightning Bolt…"
                    disabled={!user}
                  />
                </div>
                <Button variant="secondary" onClick={() => setBulkOpen((v) => !v)} disabled={!user}>
                  <ClipboardList className="size-4" aria-hidden />
                  Paste a list
                </Button>
              </div>

              {!user && (
                <p className="rounded-btn border border-border bg-bg px-3 py-2 text-sm text-fg-muted">
                  <Link to="/login" className="font-medium text-brand-600 hover:underline">
                    Sign in
                  </Link>{' '}
                  to search cards and build a sell list.
                </p>
              )}

              {bulkOpen && (
                <div className="space-y-3 rounded-card border border-border bg-bg p-3">
                  <Textarea
                    label="One card per line — quantities like “4x” are optional"
                    rows={6}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={'4 Lightning Bolt\n2x Counterspell\nSol Ring'}
                    className="font-mono text-sm"
                  />
                  <Button onClick={() => void importBulk()} disabled={!bulkText.trim()} loading={bulkBusy}>
                    Add cards to my list
                  </Button>
                </div>
              )}

              {unmatched.length > 0 && (
                <p className="rounded-btn border border-warning-500/30 bg-warning-50 px-3 py-2 text-sm text-warning-700">
                  No priced match for: {unmatched.join(', ')} — search for them individually or ask at the counter.
                </p>
              )}

              {searchQuery.isFetching && <LoadingPanel />}
              {!searchQuery.isFetching && (searchQuery.data?.length ?? 0) > 0 && (
                <ul className="space-y-2">
                  {searchQuery.data!.slice(0, 12).map((card) => (
                    <SearchResultRow
                      key={card.id}
                      card={card}
                      rates={effectiveRates}
                      payoutMethod={payoutMethod}
                      onAdd={(isFoil, condition, quantity) => addLine(card, null, isFoil, condition, quantity)}
                    />
                  ))}
                </ul>
              )}
              {!searchQuery.isFetching && debouncedSearch.trim().length >= 2 && searchQuery.data?.length === 0 && (
                <EmptyState icon={Search} title="No matches" description="Try a different card name." />
              )}
            </CardBody>
          </Card>

          {/* Buy list */}
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Sparkles aria-hidden className="size-4 text-brand-600" />
                  Buy list — premium rates
                </span>
              }
              subtitle={`Cards ${store?.name ?? 'the store'} is actively hunting. ${
                showBuylistBonus
                  ? `They pay ${effectiveRates.buylistCashPercent}% cash / ${effectiveRates.buylistCreditPercent}% credit on these.`
                  : ''
              }`}
            />
            <CardBody>
              {buylistLoading ? (
                <LoadingPanel />
              ) : buylist.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No buy list yet"
                  description="This store has not published cards it wants to buy. You can still sell anything via search above."
                />
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {buylist.map((entry) => (
                    <BuylistTile
                      key={entry.id}
                      entry={entry}
                      rates={effectiveRates}
                      payoutMethod={payoutMethod}
                      disabled={!user}
                      onAdd={() => entry.card && addLine(entry.card, entry, entry.wantsFoil, 'NM', 1)}
                    />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Past submissions */}
          {user && (submissionsQuery.data?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Your past submissions" />
              <CardBody className="space-y-3">
                {submissionsQuery.data!.map((submission) => (
                  <div key={submission.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-fg">
                        {formatPrice(submission.totalOfferCents)}{' '}
                        <span className="font-normal text-fg-muted">
                          in {submission.payoutMethod === 'credit' ? 'store credit' : 'cash'}
                        </span>
                      </p>
                      <p className="text-xs text-fg-muted">
                        {submission.items.reduce((n, item) => n + (item.acceptedQuantity ?? item.quantity), 0)} cards ·{' '}
                        {formatDate(submission.createdAt)}
                        {submission.totalMarketCents > 0 ? ` · market ${formatPrice(submission.totalMarketCents)}` : ''}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[submission.status]} className="uppercase">
                      {submission.status}
                    </Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Desktop: sticky summary column */}
        <aside className="hidden lg:sticky lg:top-20 lg:block">
          <Card>
            <CardHeader title="Your sell list" subtitle={lines.length === 0 ? 'Add cards to see your offer.' : undefined} />
            <CardBody>{summaryPanel}</CardBody>
          </Card>
        </aside>
      </div>

      {/* Mobile: floating review pill + modal */}
      {lines.length > 0 && (
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="fixed inset-x-4 bottom-6 z-40 flex items-center justify-between gap-4 rounded-full bg-brand-600 px-5 py-3 font-bold text-white shadow-2xl lg:hidden"
        >
          <span className="inline-flex items-center gap-2">
            Review sell list
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/20 px-2 text-sm">
              {cardCount}
            </span>
          </span>
          <span>{formatPrice(totals.offer)}</span>
        </button>
      )}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Your sell list">
        {summaryPanel}
      </Modal>

      {printingLine && (
        <ChangePrintingModal
          line={printingLine}
          onClose={() => setPrintingLine(null)}
          onSelect={(card) => {
            updateLine(printingLine.key, { card })
            setPrintingLine(null)
          }}
        />
      )}
    </div>
  )
}

/** One search result: pick finish + condition + quantity, see the live offer. */
function SearchResultRow({
  card,
  rates,
  payoutMethod,
  onAdd,
}: {
  card: CardSummary
  rates: TradeRates
  payoutMethod: SellPayoutMethod
  onAdd: (isFoil: boolean, condition: Condition, quantity: number) => void
}) {
  const [isFoil, setIsFoil] = useState(false)
  const [condition, setCondition] = useState<Condition>('NM')
  const [quantity, setQuantity] = useState(1)

  const finishes = card.finishes ?? ['nonfoil']
  const hasFoil = finishes.includes('foil') || finishes.includes('etched')
  const hasNonfoil = finishes.includes('nonfoil')
  const market = scryfallPriceCents(card, isFoil ? 'foil' : 'nonfoil')
  const percent = payoutMethod === 'credit' ? rates.creditPercent : rates.cashPercent
  const offer = market == null ? null : Math.floor((market * percent) / 100)

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card">
      {cardImage(card) && <img src={cardImage(card)} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-fg">{card.name}</p>
        <p className="text-xs text-fg-muted">
          {card.setName ?? card.setCode?.toUpperCase() ?? '—'} · #{card.collectorNumber ?? '—'}
        </p>
        <p className="mt-1 text-sm">
          {offer == null ? (
            <span className="text-fg-muted">No market price — ask at the counter</span>
          ) : (
            <>
              <span className="font-bold text-success-700">{formatPrice(offer)}</span>{' '}
              <span className="text-xs text-fg-muted">per copy ({formatPrice(market!)} market)</span>
            </>
          )}
        </p>
      </div>
      <div className="flex items-end gap-2">
        {hasFoil && hasNonfoil && (
          <Select label="Finish" value={isFoil ? 'foil' : 'nonfoil'} onChange={(e) => setIsFoil(e.target.value === 'foil')} className="w-24">
            <option value="nonfoil">Normal</option>
            <option value="foil">Foil</option>
          </Select>
        )}
        <Select label="Cond." value={condition} onChange={(e) => setCondition(e.target.value as Condition)} className="w-20">
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input
          label="Qty"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-16"
        />
        <Button size="sm" variant="secondary" disabled={offer == null} onClick={() => onAdd(!hasNonfoil || isFoil, condition, quantity)}>
          Add
        </Button>
      </div>
    </li>
  )
}

/** Buy-list grid tile with the premium offer per copy. */
function BuylistTile({
  entry,
  rates,
  payoutMethod,
  disabled,
  onAdd,
}: {
  entry: BuylistEntry
  rates: TradeRates
  payoutMethod: SellPayoutMethod
  disabled: boolean
  onAdd: () => void
}) {
  const card = entry.card
  if (!card) return null
  const market = scryfallPriceCents(card, entry.wantsFoil ? 'foil' : 'nonfoil')
  const percent = payoutMethod === 'credit' ? rates.buylistCreditPercent : rates.buylistCashPercent
  const offer = entry.offerCents ?? (market == null ? null : Math.floor((market * percent) / 100))

  return (
    <li className="overflow-hidden rounded-card border border-brand-500/30 bg-surface shadow-card">
      {cardImage(card) && <img src={cardImage(card)} alt="" className="aspect-[63/88] w-full object-cover" />}
      <div className="space-y-1 p-2">
        <p className="truncate text-sm font-bold text-fg">{card.name}</p>
        <p className="truncate text-xs text-fg-muted">
          {card.setCode?.toUpperCase() ?? '—'}
          {entry.wantsFoil ? ' · Foil' : ''}
          {entry.maxQuantity != null ? ` · up to ${entry.maxQuantity}` : ''}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-base font-bold text-success-700">{offer == null ? '—' : formatPrice(offer)}</span>
          <Badge tone="brand">Buy list</Badge>
        </div>
        {entry.notes && <p className="truncate text-xs text-fg-muted">{entry.notes}</p>}
        <Button size="sm" variant="secondary" className="w-full" disabled={disabled || offer == null} onClick={onAdd}>
          Add
        </Button>
      </div>
    </li>
  )
}

/** The sell list itself: lines, payout method toggle, totals, and submit. */
function SummaryPanel({
  lines,
  rates,
  payoutMethod,
  onPayoutMethod,
  totals,
  onUpdateLine,
  onRemoveLine,
  onChangePrinting,
  onClear,
  kioskMode,
  kioskCustomerName,
  onKioskCustomerName,
  user,
  storeName,
  submit,
}: {
  lines: SellLine[]
  rates: TradeRates
  payoutMethod: SellPayoutMethod
  onPayoutMethod: (method: SellPayoutMethod) => void
  totals: { market: number; offer: number; buylistOffer: number; unpriced: number }
  onUpdateLine: (key: string, patch: Partial<Pick<SellLine, 'quantity' | 'condition'>>) => void
  onRemoveLine: (key: string) => void
  onChangePrinting: (line: SellLine) => void
  onClear: () => void
  kioskMode: boolean
  kioskCustomerName: string
  onKioskCustomerName: (name: string) => void
  user: boolean
  storeName: string
  submit: { isPending: boolean; isError: boolean; error: unknown; mutate: () => void }
}) {
  return (
    <div className="space-y-4">
      <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
        {lines.length === 0 && <p className="text-sm text-fg-muted">Your list is empty.</p>}
        {lines.map((line) => {
          const offer = lineOfferCents(line, rates, payoutMethod)
          return (
            <div
              key={line.key}
              className={`flex items-start gap-3 rounded-card border p-2 text-sm ${
                line.entry ? 'border-brand-500/40 bg-brand-50/40' : 'border-border bg-surface'
              }`}
            >
              {cardImage(line.card) && <img src={cardImage(line.card)} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-bold text-fg">
                  {line.card.name}
                  {line.isFoil ? ' ✨' : ''}
                </p>
                <p className="text-xs text-fg-muted">
                  {line.card.setCode?.toUpperCase() ?? '—'}
                  {line.entry && (
                    <Badge tone="brand" className="ml-1">
                      Buy list
                    </Badge>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`qty-${line.key}`}>
                    Quantity of {line.card.name}
                  </label>
                  <input
                    id={`qty-${line.key}`}
                    type="number"
                    min={1}
                    max={line.entry?.maxQuantity ?? undefined}
                    value={line.quantity}
                    onChange={(e) => {
                      const cap = line.entry?.maxQuantity ?? Number.POSITIVE_INFINITY
                      onUpdateLine(line.key, { quantity: Math.max(1, Math.min(Number(e.target.value) || 1, cap)) })
                    }}
                    className="w-14 rounded-btn border border-border bg-surface px-2 py-1 text-fg"
                  />
                  <label className="sr-only" htmlFor={`cond-${line.key}`}>
                    Condition of {line.card.name}
                  </label>
                  <select
                    id={`cond-${line.key}`}
                    value={line.condition}
                    onChange={(e) => onUpdateLine(line.key, { condition: e.target.value as Condition })}
                    className="rounded-btn border border-border bg-surface px-1 py-1 text-xs text-fg"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {!line.entry && (
                    <button
                      type="button"
                      onClick={() => onChangePrinting(line)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Repeat aria-hidden className="size-3" />
                      Printing
                    </button>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-bold text-fg">{offer == null ? '—' : formatPrice(offer * line.quantity)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${line.card.name}`}
                  onClick={() => onRemoveLine(line.key)}
                  className="rounded-full p-1 text-fg-muted hover:bg-bg hover:text-danger-700"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-btn border border-border bg-bg p-1">
          <button
            type="button"
            onClick={() => onPayoutMethod('credit')}
            className={`rounded-btn py-2 text-sm font-bold transition-colors ${
              payoutMethod === 'credit' ? 'bg-brand-600 text-white' : 'text-fg-muted hover:bg-surface'
            }`}
          >
            Store credit ({rates.creditPercent}%)
          </button>
          <button
            type="button"
            onClick={() => onPayoutMethod('cash')}
            className={`rounded-btn py-2 text-sm font-bold transition-colors ${
              payoutMethod === 'cash' ? 'bg-brand-600 text-white' : 'text-fg-muted hover:bg-surface'
            }`}
          >
            Cash ({rates.cashPercent}%)
          </button>
        </div>

        <div className="flex justify-between text-sm text-fg-muted">
          <span>Market value</span>
          <span className="font-medium text-fg">{formatPrice(totals.market)}</span>
        </div>
        {totals.buylistOffer > 0 && (
          <div className="flex justify-between text-sm text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <Sparkles aria-hidden className="size-3 text-brand-600" />
              Buy-list bonus included
            </span>
            <span className="font-medium text-fg">{formatPrice(totals.buylistOffer)}</span>
          </div>
        )}
        {totals.unpriced > 0 && (
          <p className="text-xs text-warning-700">
            {totals.unpriced} line{totals.unpriced === 1 ? '' : 's'} without market pricing will be quoted at the counter.
          </p>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-bold text-fg">Your offer</span>
          <span className="font-display text-2xl font-extrabold text-success-700">{formatPrice(totals.offer)}</span>
        </div>
      </div>

      {kioskMode ? (
        <div className="space-y-3">
          <Input
            label="Customer name"
            value={kioskCustomerName}
            onChange={(e) => onKioskCustomerName(e.target.value)}
            placeholder="Walk-up customer's name"
            required
          />
          <Button
            className="w-full"
            size="lg"
            loading={submit.isPending}
            disabled={lines.length === 0 || !kioskCustomerName.trim()}
            onClick={() => submit.mutate()}
          >
            <BadgeCheck aria-hidden className="size-4" />
            Submit for customer
          </Button>
        </div>
      ) : user ? (
        <Button className="w-full" size="lg" loading={submit.isPending} disabled={lines.length === 0} onClick={() => submit.mutate()}>
          <BadgeCheck aria-hidden className="size-4" />
          Submit to {storeName}
        </Button>
      ) : (
        <Link to="/login" className={`${buttonVariants({ variant: 'primary', size: 'lg' })} w-full`}>
          Sign in to submit
        </Link>
      )}

      {lines.length > 0 && (
        <Button variant="ghost" className="w-full text-danger-700" onClick={onClear}>
          <Trash2 aria-hidden className="size-4" />
          Clear list
        </Button>
      )}
      {submit.isError && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {extractErrorMessage(submit.error, 'Could not submit your list.')}
        </p>
      )}
    </div>
  )
}

/** Pick a different printing of the same card (exact name match, priced first). */
function ChangePrintingModal({
  line,
  onClose,
  onSelect,
}: {
  line: SellLine
  onClose: () => void
  onSelect: (card: CardSummary) => void
}) {
  const printingsQuery = useQuery({
    queryKey: ['sell-printings', line.card.name],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', { params: { q: line.card.name } })
      return data.filter((card) => matchesName(card, line.card.name.toLowerCase()))
    },
  })

  return (
    <Modal open onClose={onClose} title={`Printings of ${line.card.name}`}>
      {printingsQuery.isLoading ? (
        <LoadingPanel />
      ) : (
        <ul className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {(printingsQuery.data ?? []).map((card) => {
            const market = scryfallPriceCents(card, line.isFoil ? 'foil' : 'nonfoil')
            return (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onSelect(card)}
                  className={`w-full overflow-hidden rounded-card border text-left transition-colors ${
                    card.id === line.card.id ? 'border-brand-600' : 'border-border hover:border-brand-500/60'
                  }`}
                >
                  {cardImage(card) && <img src={cardImage(card)} alt="" className="aspect-[63/88] w-full object-cover" />}
                  <div className="p-1.5">
                    <p className="truncate text-xs font-bold text-fg">{card.setCode?.toUpperCase() ?? '—'}</p>
                    <p className="text-xs text-fg-muted">{market == null ? 'No price' : formatPrice(market)}</p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
