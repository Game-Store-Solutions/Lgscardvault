import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Search, Trash2, WalletCards, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, parsePriceInput } from '../../api/client'
import type { BuylistEntry, CardSummary, SellSubmission, SellSubmissionStatus } from '../../api/types'
import { useDebouncedValue } from '../../hooks'
import { formatDate } from '../../lib/format'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, LoadingPanel } from '../../components/ui'

const buylistKey = (slug: string) => ['buylist', slug] as const
const submissionsKey = (slug: string) => ['sell-submissions', slug] as const

const STATUS_TONE: Record<SellSubmissionStatus, 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

/** Next actions staff can take per status — mirrors the backend state machine. */
const NEXT_ACTIONS: Record<SellSubmissionStatus, { status: SellSubmissionStatus; label: string }[]> = {
  pending: [
    { status: 'accepted', label: 'Accept' },
    { status: 'declined', label: 'Decline' },
  ],
  accepted: [
    { status: 'completed', label: 'Mark completed' },
    { status: 'declined', label: 'Decline' },
  ],
  declined: [],
  completed: [],
}

/**
 * Admin Sell/Trade: curate the buy list (what the store pays for which
 * cards) and work incoming customer sell submissions.
 */
export default function SellTradeTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()

  const { data: buylist = [], isLoading: buylistLoading } = useQuery({
    queryKey: buylistKey(slug),
    queryFn: async () => {
      const { data } = await api.get<BuylistEntry[]>(`/stores/${slug}/buylist`)
      return data
    },
  })

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: submissionsKey(slug),
    queryFn: async () => {
      const { data } = await api.get<SellSubmission[]>(`/stores/${slug}/sell-submissions`)
      return data
    },
    refetchInterval: 30_000,
  })

  const invalidateBuylist = () => queryClient.invalidateQueries({ queryKey: buylistKey(slug) })

  // --- Add-to-buylist search ---
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
        offerCents: parsePriceInput(offerText) ?? 0,
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
      await invalidateBuylist()
    },
  })

  const removeEntry = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/stores/${slug}/buylist/${id}`)
    },
    onSuccess: invalidateBuylist,
  })

  const updateOffer = useMutation({
    mutationFn: async ({ id, offerCents }: { id: number; offerCents: number }) => {
      await api.patch(`/stores/${slug}/buylist/${id}`, { offerCents })
    },
    onSuccess: invalidateBuylist,
  })

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: SellSubmissionStatus }) => {
      await api.patch(`/stores/${slug}/sell-submissions/${id}`, { status })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: submissionsKey(slug) }),
  })

  const pendingCount = submissions.filter((s) => s.status === 'pending').length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Buy list"
          subtitle="Cards you want to buy from customers, with your cash offer. Shown publicly on your Sell/Trade page."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] sm:items-end">
            <Input label="Add a card" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null) }} placeholder="Search the catalog…" />
            <Input label="Offer ($)" value={offerText} onChange={(e) => setOfferText(e.target.value)} inputMode="decimal" placeholder="2.50" />
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
              <Button
                size="sm"
                loading={addEntry.isPending}
                disabled={parsePriceInput(offerText) === null}
                onClick={() => addEntry.mutate()}
              >
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

          {buylistLoading ? (
            <LoadingPanel />
          ) : buylist.length === 0 ? (
            <EmptyState icon={WalletCards} title="Your buy list is empty" description="Add the cards you want to buy — they appear on your public Sell/Trade page." />
          ) : (
            <ul className="space-y-2">
              {buylist.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-2">
                  {entry.card && cardImage(entry.card) && <img src={cardImage(entry.card)} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">{entry.card?.name}</p>
                    <p className="text-xs text-fg-muted">
                      {entry.card?.setCode?.toUpperCase()}
                      {entry.wantsFoil ? ' · Foil' : ''}
                      {entry.maxQuantity != null ? ` · up to ${entry.maxQuantity}` : ''}
                    </p>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={(entry.offerCents / 100).toFixed(2)}
                    aria-label={`Offer for ${entry.card?.name ?? 'card'}`}
                    className="w-20 rounded-btn border border-border bg-surface px-2 py-1 text-right text-sm font-bold text-fg"
                    onBlur={(e) => {
                      const cents = parsePriceInput(e.target.value)
                      if (cents !== null && cents !== entry.offerCents) updateOffer.mutate({ id: entry.id, offerCents: cents })
                    }}
                  />
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

      <Card>
        <CardHeader
          title="Sell submissions"
          subtitle={`${pendingCount} pending — accept to have the customer bring the cards in, complete once paid out.`}
        />
        <CardBody className="space-y-4">
          {submissionsLoading ? (
            <LoadingPanel />
          ) : submissions.length === 0 ? (
            <EmptyState icon={Search} title="No submissions yet" description="Customer sell lists will appear here." />
          ) : (
            submissions.map((submission) => (
              <div key={submission.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-fg">
                      {submission.customerName ?? 'Customer'}
                      <span className="ml-2 text-sm font-medium text-fg-muted">{submission.customerEmail}</span>
                    </p>
                    <p className="text-xs text-fg-muted">{formatDate(submission.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[submission.status]} className="uppercase">{submission.status}</Badge>
                    <span className="font-display text-xl font-extrabold text-success-700">{formatPrice(submission.totalOfferCents)}</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                  {submission.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-fg">
                        {item.quantity}× {item.cardName}
                        {item.isFoil ? ' (Foil)' : ''}
                      </span>
                      <span className="shrink-0 text-fg-muted">{formatPrice(item.offerCentsEach)} each</span>
                    </li>
                  ))}
                </ul>
                {NEXT_ACTIONS[submission.status].length > 0 && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    {NEXT_ACTIONS[submission.status].map((action) => (
                      <Button
                        key={action.status}
                        size="sm"
                        variant={action.status === 'declined' ? 'ghost' : 'primary'}
                        className={action.status === 'declined' ? 'text-danger-700' : undefined}
                        loading={decide.isPending && decide.variables?.id === submission.id && decide.variables.status === action.status}
                        onClick={() => decide.mutate({ id: submission.id, status: action.status })}
                      >
                        <Check className="size-4" aria-hidden />
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {decide.isError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {extractErrorMessage(decide.error, 'Could not update the submission.')}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
