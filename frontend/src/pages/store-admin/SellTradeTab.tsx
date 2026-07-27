import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Percent, Plus, Printer, Search, Trash2, WalletCards, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, parsePriceInput, scryfallPriceCents } from '../../api/client'
import type {
  BuylistEntry,
  CardSummary,
  SellSubmission,
  SellSubmissionStatus,
  Store,
  TradeRateSettings,
  TradeRates,
} from '../../api/types'
import { useDebouncedValue, useStore } from '../../hooks'
import { formatDate } from '../../lib/format'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, LoadingPanel, Modal, Select } from '../../components/ui'

const buylistKey = (slug: string) => ['buylist-admin', slug] as const
const submissionsKey = (slug: string) => ['sell-submissions', slug] as const
const tradeRatesKey = (slug: string) => ['trade-rates', slug] as const

const STATUS_TONE: Record<SellSubmissionStatus, 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

/**
 * Admin Sell/Trade: payout rate settings, buy-list curation, and the
 * submission review workflow (partial accepts, print sheet, and completion
 * which stocks accepted cards into inventory).
 */
export default function SellTradeTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: submissionsKey(slug),
    queryFn: async () => {
      const { data } = await api.get<SellSubmission[]>(`/stores/${slug}/sell-submissions`)
      return data
    },
    refetchInterval: 30_000,
  })

  const { data: rates } = useQuery({
    queryKey: tradeRatesKey(slug),
    queryFn: async () => {
      const { data } = await api.get<TradeRates>(`/stores/${slug}/trade-rates`)
      return data
    },
  })

  const [reviewing, setReviewing] = useState<SellSubmission | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveStatus, setArchiveStatus] = useState<'all' | 'accepted' | 'completed' | 'declined'>('all')

  const { open, archive } = useMemo(() => {
    const open = submissions.filter((s) => s.status === 'pending' || s.status === 'accepted')
    const archive = submissions.filter((s) => s.status === 'completed' || s.status === 'declined')
    return { open, archive }
  }, [submissions])

  const visibleArchive = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase()
    return archive.filter((submission) => {
      if (archiveStatus !== 'all' && submission.status !== archiveStatus) return false
      if (!q) return true
      return (
        (submission.customerName ?? '').toLowerCase().includes(q) ||
        (submission.customerEmail ?? '').toLowerCase().includes(q) ||
        String(submission.id).includes(q)
      )
    })
  }, [archive, archiveSearch, archiveStatus])

  return (
    <div className="space-y-6">
      <TradeRatesCard slug={slug} rates={rates} />
      <BuylistCard slug={slug} rates={rates} />

      <Card>
        <CardHeader
          title="Sell submissions"
          subtitle={`${open.filter((s) => s.status === 'pending').length} pending review — finalize the offer, then complete once the customer is paid (completed cards are stocked into inventory automatically).`}
        />
        <CardBody className="space-y-4">
          {submissionsLoading ? (
            <LoadingPanel />
          ) : open.length === 0 ? (
            <EmptyState icon={Search} title="No open submissions" description="Customer sell lists will appear here." />
          ) : (
            <ul className="space-y-2">
              {open.map((submission) => (
                <SubmissionRow key={submission.id} submission={submission} onReview={() => setReviewing(submission)} />
              ))}
            </ul>
          )}

          <div className="border-t border-border pt-3">
            <Button variant="ghost" onClick={() => setShowArchive((v) => !v)}>
              <Archive className="size-4" aria-hidden />
              {showArchive ? 'Hide' : 'Show'} archive ({archive.length})
            </Button>
            {showArchive && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <div className="min-w-56 flex-1">
                    <Input
                      label="Search archive"
                      value={archiveSearch}
                      onChange={(e) => setArchiveSearch(e.target.value)}
                      placeholder="Customer, email, or #id…"
                    />
                  </div>
                  <Select
                    label="Status"
                    value={archiveStatus}
                    onChange={(e) => setArchiveStatus(e.target.value as typeof archiveStatus)}
                    className="w-36"
                  >
                    <option value="all">All</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                  </Select>
                </div>
                {visibleArchive.length === 0 ? (
                  <p className="text-sm text-fg-muted">No archived submissions match.</p>
                ) : (
                  <ul className="space-y-2">
                    {visibleArchive.map((submission) => (
                      <SubmissionRow key={submission.id} submission={submission} onReview={() => setReviewing(submission)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {reviewing && (
        <ReviewSubmissionModal
          slug={slug}
          submission={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={async () => {
            setReviewing(null)
            await queryClient.invalidateQueries({ queryKey: submissionsKey(slug) })
          }}
        />
      )}
    </div>
  )
}

/** Payout rate settings: base + buy-list premium + promo window. */
function TradeRatesCard({ slug, rates }: { slug: string; rates: TradeRates | undefined }) {
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  const [form, setForm] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (store && !loaded) {
      const settings: TradeRateSettings = store.tradeRates ?? {}
      setForm({
        creditRatePercent: settings.creditRatePercent?.toString() ?? '',
        cashRatePercent: settings.cashRatePercent?.toString() ?? '',
        buylistCreditRatePercent: settings.buylistCreditRatePercent?.toString() ?? '',
        buylistCashRatePercent: settings.buylistCashRatePercent?.toString() ?? '',
        promoCreditRatePercent: settings.promoCreditRatePercent?.toString() ?? '',
        promoCashRatePercent: settings.promoCashRatePercent?.toString() ?? '',
        promoStartsAt: settings.promoStartsAt?.slice(0, 16) ?? '',
        promoEndsAt: settings.promoEndsAt?.slice(0, 16) ?? '',
      })
      setLoaded(true)
    }
  }, [store, loaded])

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const tradeRates: Record<string, unknown> = {}
      for (const key of [
        'creditRatePercent',
        'cashRatePercent',
        'buylistCreditRatePercent',
        'buylistCashRatePercent',
        'promoCreditRatePercent',
        'promoCashRatePercent',
      ]) {
        if (form[key]?.trim()) tradeRates[key] = Number(form[key])
      }
      for (const key of ['promoStartsAt', 'promoEndsAt']) {
        if (form[key]?.trim()) tradeRates[key] = new Date(form[key]).toISOString()
      }
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, { tradeRates })
      return data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['store', slug] }),
        queryClient.invalidateQueries({ queryKey: tradeRatesKey(slug) }),
      ])
    },
  })

  const percentField = (key: string, label: string, placeholder: string) => (
    <Input
      label={label}
      value={form[key] ?? ''}
      onChange={(e) => set(key, e.target.value.replace(/\D/g, '').slice(0, 3))}
      inputMode="numeric"
      placeholder={placeholder}
    />
  )

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Percent aria-hidden className="size-4 text-brand-600" />
            Trade-in rates
          </span>
        }
        subtitle={
          rates
            ? `Customers currently get ${rates.cashPercent}% cash / ${rates.creditPercent}% credit of market price` +
              (rates.buylistCashPercent > rates.cashPercent || rates.buylistCreditPercent > rates.creditPercent
                ? `, boosted to ${rates.buylistCashPercent}% / ${rates.buylistCreditPercent}% on your buy list`
                : '') +
              (rates.promoActive ? ' — promo rates are LIVE.' : '.')
            : 'Percent of market price paid for trade-ins.'
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Base rates</p>
            {percentField('creditRatePercent', 'Store credit %', '60')}
            {percentField('cashRatePercent', 'Cash %', '45')}
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Buy-list premium</p>
            {percentField('buylistCreditRatePercent', 'Credit %', 'base')}
            {percentField('buylistCashRatePercent', 'Cash %', 'base')}
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Promo window</p>
            {percentField('promoCreditRatePercent', 'Promo credit %', 'off')}
            {percentField('promoCashRatePercent', 'Promo cash %', 'off')}
            <Input label="Starts" type="datetime-local" value={form.promoStartsAt ?? ''} onChange={(e) => set('promoStartsAt', e.target.value)} />
            <Input label="Ends" type="datetime-local" value={form.promoEndsAt ?? ''} onChange={(e) => set('promoEndsAt', e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save rates
          </Button>
          {save.isSuccess && <span className="text-sm font-medium text-success-700">Saved.</span>}
          {save.isError && (
            <span role="alert" className="text-sm font-medium text-danger-700">
              {extractErrorMessage(save.error, 'Could not save the rates.')}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

/** Buy-list curation: add cards (pinned offer optional), toggle visibility, remove. */
function BuylistCard({ slug, rates }: { slug: string; rates: TradeRates | undefined }) {
  const queryClient = useQueryClient()

  const { data: buylist = [], isLoading } = useQuery({
    queryKey: buylistKey(slug),
    queryFn: async () => {
      const { data } = await api.get<BuylistEntry[]>(`/stores/${slug}/buylist?all=1`)
      return data
    },
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: buylistKey(slug) }),
      queryClient.invalidateQueries({ queryKey: ['buylist', slug] }),
    ])

  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [selected, setSelected] = useState<CardSummary | null>(null)
  const [offerText, setOfferText] = useState('')
  const [wantsFoil, setWantsFoil] = useState(false)
  const [maxQty, setMaxQty] = useState('')

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['buylist-card-search', slug, debounced],
    enabled: debounced.trim().length > 1,
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', { params: { q: debounced } })
      return data.slice(0, 8)
    },
  })

  const addEntry = useMutation({
    mutationFn: async () => {
      if (!selected) return
      await api.post(`/stores/${slug}/buylist`, {
        cardId: selected.id,
        offerCents: offerText.trim() ? parsePriceInput(offerText) : null,
        wantsFoil,
        maxQuantity: maxQty.trim() ? Number(maxQty) : null,
      })
    },
    onSuccess: async () => {
      setSelected(null)
      setQuery('')
      setOfferText('')
      setMaxQty('')
      setWantsFoil(false)
      await invalidate()
    },
  })

  const patchEntry = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; offerCents?: number | null; active?: boolean }) => {
      await api.patch(`/stores/${slug}/buylist/${id}`, body)
    },
    onSuccess: invalidate,
  })

  const removeEntry = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/stores/${slug}/buylist/${id}`)
    },
    onSuccess: invalidate,
  })

  const premiumLabel = (entry: BuylistEntry): string => {
    if (!rates) return 'premium rate'
    const percent = rates.buylistCashPercent
    const market = entry.card ? scryfallPriceCents(entry.card, entry.wantsFoil ? 'foil' : 'nonfoil') : null
    return market == null ? `${percent}% of market` : `${percent}% ≈ ${formatPrice(Math.floor((market * percent) / 100))} cash`
  }

  return (
    <Card>
      <CardHeader
        title="Buy list"
        subtitle="Cards you actively want. Leave the offer blank to pay your premium rate at market; pin a price to lock the per-copy offer."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] sm:items-end">
          <Input label="Add a card" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null) }} placeholder="Search the catalog…" />
          <Input label="Pinned offer ($)" value={offerText} onChange={(e) => setOfferText(e.target.value)} inputMode="decimal" placeholder="Premium rate" />
          <Input label="Max copies" value={maxQty} onChange={(e) => setMaxQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Any" />
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-fg">
            <input type="checkbox" checked={wantsFoil} onChange={(e) => setWantsFoil(e.target.checked)} className="size-4 accent-current" />
            Foil
          </label>
        </div>

        {selected ? (
          <div className="flex items-center gap-3 rounded-card border border-brand-500 bg-brand-50/40 p-2">
            {cardImage(selected) && <img src={cardImage(selected)} alt="" className="h-14 w-10 rounded object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-fg">{selected.name}</p>
              <p className="text-xs text-fg-muted">{selected.setCode?.toUpperCase()} #{selected.collectorNumber ?? '—'}</p>
            </div>
            <Button size="sm" loading={addEntry.isPending} onClick={() => addEntry.mutate()}>
              <Plus className="size-4" aria-hidden />
              Add to buy list
            </Button>
            <button type="button" aria-label="Clear selection" onClick={() => setSelected(null)} className="rounded-full p-1 text-fg-muted hover:bg-bg">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : results.length > 0 ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {results.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => setSelected(card)}
                  className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-2 text-left transition-colors hover:border-brand-300"
                >
                  {cardImage(card) && <img src={cardImage(card)} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-fg">{card.name}</span>
                    <span className="block text-xs text-fg-muted">{card.setCode?.toUpperCase()} · {card.setName ?? ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : isFetching ? (
          <LoadingPanel />
        ) : null}

        {addEntry.isError && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(addEntry.error, 'Could not add the buy list entry.')}
          </p>
        )}

        {isLoading ? (
          <LoadingPanel />
        ) : buylist.length === 0 ? (
          <EmptyState icon={WalletCards} title="Your buy list is empty" description="Add the cards you want to buy — they appear on your public Sell/Trade page at premium rates." />
        ) : (
          <ul className="space-y-2">
            {buylist.map((entry) => (
              <li key={entry.id} className={`flex items-center gap-3 rounded-card border border-border p-2 ${entry.active ? 'bg-surface' : 'bg-bg opacity-70'}`}>
                {entry.card && cardImage(entry.card) && <img src={cardImage(entry.card)} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">
                    {entry.card?.name}
                    {!entry.active && <span className="ml-2 text-xs font-medium text-fg-muted">(hidden)</span>}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {entry.card?.setCode?.toUpperCase()}
                    {entry.wantsFoil ? ' · Foil' : ''}
                    {entry.maxQuantity != null ? ` · up to ${entry.maxQuantity}` : ''}
                    {entry.offerCents == null ? ` · ${premiumLabel(entry)}` : ''}
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={entry.offerCents == null ? '' : (entry.offerCents / 100).toFixed(2)}
                  placeholder="rate"
                  aria-label={`Pinned offer for ${entry.card?.name ?? 'card'}`}
                  className="w-20 rounded-btn border border-border bg-surface px-2 py-1 text-right text-sm font-bold text-fg"
                  onBlur={(e) => {
                    const text = e.target.value.trim()
                    const cents = text ? parsePriceInput(text) : null
                    if (cents !== entry.offerCents) patchEntry.mutate({ id: entry.id, offerCents: cents })
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => patchEntry.mutate({ id: entry.id, active: !entry.active })}>
                  {entry.active ? 'Hide' : 'Show'}
                </Button>
                <button
                  type="button"
                  aria-label={`Remove ${entry.card?.name ?? 'card'} from buy list`}
                  onClick={() => removeEntry.mutate(entry.id)}
                  className="rounded-full p-1 text-fg-muted hover:bg-bg hover:text-danger-700"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/** One submission line in the pending/archive lists. */
function SubmissionRow({ submission, onReview }: { submission: SellSubmission; onReview: () => void }) {
  const cardCount = submission.items.reduce((n, item) => n + (item.acceptedQuantity ?? item.quantity), 0)
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-fg">
          {submission.customerName ?? 'Customer'}
          {submission.channel === 'kiosk' && (
            <Badge tone="neutral" className="ml-2">
              Kiosk
            </Badge>
          )}
        </p>
        <p className="text-xs text-fg-muted">
          #{submission.id} · {cardCount} cards · {formatDate(submission.createdAt)}
          {submission.customerEmail ? ` · ${submission.customerEmail}` : ''}
        </p>
      </div>
      <span className="text-sm text-fg-muted">
        {submission.payoutMethod === 'credit' ? 'Store credit' : 'Cash'}
      </span>
      <span className="font-display text-lg font-extrabold text-success-700">{formatPrice(submission.totalOfferCents)}</span>
      <Badge tone={STATUS_TONE[submission.status]} className="uppercase">
        {submission.status}
      </Badge>
      <Button size="sm" variant="secondary" onClick={onReview}>
        {submission.status === 'pending' ? 'Review' : 'Details'}
      </Button>
    </li>
  )
}

interface ReviewedLine {
  id: number
  accepted: boolean
  acceptedQuantity: number
}

/**
 * Review a submission: tick lines, trim quantities, watch the new offer,
 * print the counter sheet, then accept / decline / complete.
 */
function ReviewSubmissionModal({
  slug,
  submission,
  onClose,
  onSaved,
}: {
  slug: string
  submission: SellSubmission
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const isPending = submission.status === 'pending'
  const [reviewed, setReviewed] = useState<ReviewedLine[]>(() =>
    submission.items.map((item) => ({ id: item.id, accepted: true, acceptedQuantity: item.acceptedQuantity ?? item.quantity })),
  )

  const decide = useMutation({
    mutationFn: async (body: { status: SellSubmissionStatus; items?: { id: number; acceptedQuantity: number }[] }) => {
      await api.patch(`/stores/${slug}/sell-submissions/${submission.id}`, body)
    },
    onSuccess: onSaved,
  })

  const lineState = (id: number) => reviewed.find((line) => line.id === id)!

  const newTotals = useMemo(() => {
    let offer = 0
    let market = 0
    for (const item of submission.items) {
      const state = reviewed.find((line) => line.id === item.id)
      const quantity = state && state.accepted ? state.acceptedQuantity : 0
      offer += quantity * item.offerCentsEach
      market += quantity * item.marketPriceCents
    }
    return { offer, market }
  }, [reviewed, submission.items])

  const acceptBody = () => ({
    status: 'accepted' as const,
    items: reviewed.map((line) => ({ id: line.id, acceptedQuantity: line.accepted ? line.acceptedQuantity : 0 })),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`${isPending ? 'Review' : 'Submission'} #${submission.id} — ${submission.customerName ?? 'Customer'}`}
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
          <span>
            Payout: <strong className="text-fg">{submission.payoutMethod === 'credit' ? 'Store credit' : 'Cash'}</strong>
          </span>
          <span>
            Submitted offer: <strong className="text-fg">{formatPrice(submission.totalOfferCents)}</strong>
          </span>
          <span>{formatDate(submission.createdAt)}</span>
          {submission.channel === 'kiosk' && <Badge tone="neutral">Kiosk</Badge>}
          <Badge tone={STATUS_TONE[submission.status]} className="uppercase">
            {submission.status}
          </Badge>
        </div>

        <div className="max-h-[45vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-xs uppercase tracking-wide text-fg-muted">
                {isPending && <th className="p-2">Buy</th>}
                <th className="p-2">Card</th>
                <th className="p-2 text-center">Offered</th>
                {isPending && <th className="p-2 text-center">Accept qty</th>}
                {!isPending && <th className="p-2 text-center">Accepted</th>}
                <th className="p-2 text-right">Per copy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {submission.items.map((item) => {
                const state = lineState(item.id)
                return (
                  <tr key={item.id} className={isPending && !state.accepted ? 'opacity-40' : undefined}>
                    {isPending && (
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={state.accepted}
                          aria-label={`Buy ${item.cardName}`}
                          onChange={(e) =>
                            setReviewed((current) =>
                              current.map((line) => (line.id === item.id ? { ...line, accepted: e.target.checked } : line)),
                            )
                          }
                          className="size-4 accent-current"
                        />
                      </td>
                    )}
                    <td className="p-2">
                      <p className="font-bold text-fg">
                        {item.cardName}
                        {item.isFoil ? ' ✨' : ''}
                        {item.isFromBuylist && (
                          <Badge tone="brand" className="ml-2">
                            Buy list
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {item.setCode?.toUpperCase() ?? '—'} · {item.condition}
                        {item.marketPriceCents > 0 ? ` · market ${formatPrice(item.marketPriceCents)}` : ''}
                      </p>
                    </td>
                    <td className="p-2 text-center">{item.quantity}</td>
                    {isPending ? (
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={state.acceptedQuantity}
                          disabled={!state.accepted}
                          aria-label={`Accepted quantity of ${item.cardName}`}
                          onChange={(e) =>
                            setReviewed((current) =>
                              current.map((line) =>
                                line.id === item.id
                                  ? { ...line, acceptedQuantity: Math.max(0, Math.min(Number(e.target.value) || 0, item.quantity)) }
                                  : line,
                              ),
                            )
                          }
                          className="w-16 rounded-btn border border-border bg-surface px-2 py-1 text-center text-fg"
                        />
                      </td>
                    ) : (
                      <td className="p-2 text-center">{item.acceptedQuantity ?? item.quantity}</td>
                    )}
                    <td className="p-2 text-right font-medium text-fg">{formatPrice(item.offerCentsEach)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <Button variant="secondary" onClick={() => printReviewSheet(submission, reviewed)}>
            <Printer className="size-4" aria-hidden />
            Print counter sheet
          </Button>
          <div className="text-right">
            {isPending && <p className="text-xs text-fg-muted">New market total {formatPrice(newTotals.market)}</p>}
            <p className="font-display text-2xl font-extrabold text-success-700">
              {formatPrice(isPending ? newTotals.offer : submission.totalOfferCents)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {isPending && (
            <>
              <Button variant="ghost" className="text-danger-700" loading={decide.isPending} onClick={() => decide.mutate({ status: 'declined' })}>
                Decline all
              </Button>
              <Button loading={decide.isPending} disabled={newTotals.offer === 0} onClick={() => decide.mutate(acceptBody())}>
                <Check className="size-4" aria-hidden />
                Finalize &amp; accept offer
              </Button>
            </>
          )}
          {submission.status === 'accepted' && (
            <>
              <Button variant="ghost" className="text-danger-700" loading={decide.isPending} onClick={() => decide.mutate({ status: 'declined' })}>
                Decline
              </Button>
              <Button loading={decide.isPending} onClick={() => decide.mutate({ status: 'completed' })}>
                <Check className="size-4" aria-hidden />
                Complete &amp; stock inventory
              </Button>
            </>
          )}
        </div>
        {decide.isError && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(decide.error, 'Could not update the submission.')}
          </p>
        )}
      </div>
    </Modal>
  )
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Print the counter review sheet through a transient iframe (same pattern as the case pull sheet). */
function printReviewSheet(submission: SellSubmission, reviewed: ReviewedLine[]) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', `Print sell submission ${submission.id}`)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    return
  }
  frameWindow.addEventListener('afterprint', () => iframe.remove(), { once: true })

  const rows = submission.items
    .map((item) => {
      const state = reviewed.find((line) => line.id === item.id)
      const accepted = item.acceptedQuantity ?? (state && state.accepted ? state.acceptedQuantity : item.quantity)
      return `
        <tr>
          <td>${escapeHtml(item.cardName)}${item.isFoil ? ' (Foil)' : ''}</td>
          <td>${escapeHtml(item.setCode?.toUpperCase() ?? '-')}</td>
          <td>${escapeHtml(item.condition)}</td>
          <td>${item.quantity}</td>
          <td>${accepted}</td>
          <td>${escapeHtml(formatPrice(item.offerCentsEach))}</td>
          <td>[&nbsp;&nbsp;]</td>
        </tr>`
    })
    .join('')

  frameDocument.open()
  frameDocument.write(`
    <!doctype html>
    <html>
      <head>
        <title>Sell submission #${submission.id}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          header { border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .muted { color: #4b5563; font-size: 13px; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; }
          th { color: #4b5563; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
          td:nth-child(n+4), th:nth-child(n+4) { text-align: right; }
          @media print { body { margin: 14mm; } }
        </style>
      </head>
      <body>
        <header>
          <h1>Sell submission #${submission.id} — ${escapeHtml(submission.customerName ?? 'Customer')}</h1>
          <div class="muted">
            ${escapeHtml(new Date(submission.createdAt).toLocaleString())}
            · payout ${submission.payoutMethod === 'credit' ? 'store credit' : 'cash'}
            · offer ${escapeHtml(formatPrice(submission.totalOfferCents))}
            ${submission.channel === 'kiosk' ? ' · kiosk' : ''}
          </div>
        </header>
        <table>
          <thead>
            <tr><th>Card</th><th>Set</th><th>Cond.</th><th>Offered</th><th>Accepted</th><th>Per copy</th><th>Checked</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `)
  frameDocument.close()
  frameWindow.focus()
  frameWindow.print()
}
