import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, ChevronDown, ChevronLeft, ChevronRight, Percent, Plus, Printer, Trash2, WalletCards, X } from 'lucide-react'
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
import { useDebouncedValue, useSellSubmissionsList, sellSubmissionsKey, useStore } from '../../hooks'
import { formatDate } from '../../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, Input, LoadingPanel, Modal, Select } from '../../components/ui'
import { cx } from '../../lib/cx'

function AccordionPanel({
  id,
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `${id}-panel`

  return (
    <Card>
      <div className="flex items-start gap-2 border-b border-border px-4 py-4 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-bg hover:text-fg"
        >
          <ChevronDown aria-hidden className={cx('size-5 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold text-fg">{title}</h3>
          {subtitle != null ? <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p> : null}
        </div>
      </div>
      {open ? (
        <div id={panelId} className="px-5 py-4">
          {children}
        </div>
      ) : null}
    </Card>
  )
}

const buylistKey = (slug: string) => ['buylist-admin', slug] as const
const tradeRatesKey = (slug: string) => ['trade-rates', slug] as const

const STATUS_TONE: Record<SellSubmissionStatus, 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

type SubmissionQueueTab = 'review' | 'accepted'

const SUBMISSIONS_PAGE_SIZE = 8
const SUBMISSION_TABLE_ROW_H = 'h-[4.75rem]'

function submissionIsArchived(submission: SellSubmission): boolean {
  if (submission.archivedAt) return true
  return submission.status === 'completed' || submission.status === 'declined'
}

function submissionCardCount(submission: SellSubmission): number {
  return submission.items.reduce((n, item) => n + (item.acceptedQuantity ?? item.quantity), 0)
}

function submissionPrimaryLabel(submission: SellSubmission): string {
  const first = submission.items[0]?.cardName
  if (!first) return 'Sell list'
  if (submission.items.length === 1) return first
  return `${first} +${submission.items.length - 1}`
}

function sellStatusPresentation(status: SellSubmissionStatus): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', className: 'bg-warning-50 text-warning-700' }
    case 'accepted':
      return { label: 'Accepted', className: 'bg-brand-50 text-brand-700' }
    case 'completed':
      return { label: 'Completed', className: 'bg-success-50 text-success-700' }
    case 'declined':
      return { label: 'Declined', className: 'bg-danger-50 text-danger-700' }
    default:
      return { label: status, className: 'bg-bg text-fg-muted' }
  }
}

/**
 * Admin Sell/Trade: payout rate settings, buy-list curation, and the
 * submission review workflow (partial accepts, print sheet, and completion
 * which stocks accepted cards into inventory).
 */
export default function SellTradeTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()

  const { data: submissions = [], isLoading: submissionsLoading } = useSellSubmissionsList(slug)

  const { data: rates } = useQuery({
    queryKey: tradeRatesKey(slug),
    queryFn: async () => {
      const { data } = await api.get<TradeRates>(`/stores/${slug}/trade-rates`)
      return data
    },
  })

  const [reviewing, setReviewing] = useState<SellSubmission | null>(null)
  const [queueTab, setQueueTab] = useState<SubmissionQueueTab>('review')
  const [queuePage, setQueuePage] = useState(1)
  const [showArchive, setShowArchive] = useState(false)
  const [archivePage, setArchivePage] = useState(1)
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveStatus, setArchiveStatus] = useState<'all' | 'accepted' | 'completed' | 'declined'>('all')

  const archiveSubmission = useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      await api.patch(`/stores/${slug}/sell-submissions/${id}`, { archived })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sellSubmissionsKey(slug) })
    },
  })

  const { needsReview, awaitingComplete, archived } = useMemo(() => {
    const needsReview = submissions.filter((s) => s.status === 'pending' && !s.archivedAt)
    const awaitingComplete = submissions.filter((s) => s.status === 'accepted' && !s.archivedAt)
    const archived = submissions.filter((s) => submissionIsArchived(s))
    return { needsReview, awaitingComplete, archived }
  }, [submissions])

  useEffect(() => setQueuePage(1), [queueTab])
  useEffect(() => setArchivePage(1), [archiveSearch, archiveStatus, showArchive])

  useEffect(() => {
    const archivedAccepted = archived.filter((s) => s.status === 'accepted')
    if (archivedAccepted.length > 0 && awaitingComplete.length === 0) {
      setShowArchive(true)
    }
  }, [archived, awaitingComplete.length])

  const visibleArchive = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase()
    return archived.filter((submission) => {
      if (archiveStatus !== 'all' && submission.status !== archiveStatus) return false
      if (!q) return true
      return (
        (submission.customerName ?? '').toLowerCase().includes(q) ||
        (submission.customerEmail ?? '').toLowerCase().includes(q) ||
        String(submission.id).includes(q)
      )
    })
  }, [archived, archiveSearch, archiveStatus])

  const pendingCount = needsReview.length
  const acceptedCount = awaitingComplete.length

  const activeQueue =
    queueTab === 'review' ? needsReview : awaitingComplete
  const queueTotalPages = Math.max(1, Math.ceil(activeQueue.length / SUBMISSIONS_PAGE_SIZE))
  const queuePageClamped = Math.min(queuePage, queueTotalPages)
  const queuePageRows = activeQueue.slice(
    (queuePageClamped - 1) * SUBMISSIONS_PAGE_SIZE,
    queuePageClamped * SUBMISSIONS_PAGE_SIZE,
  )

  const archiveTotalPages = Math.max(1, Math.ceil(visibleArchive.length / SUBMISSIONS_PAGE_SIZE))
  const archivePageClamped = Math.min(archivePage, archiveTotalPages)
  const archivePageRows = visibleArchive.slice(
    (archivePageClamped - 1) * SUBMISSIONS_PAGE_SIZE,
    archivePageClamped * SUBMISSIONS_PAGE_SIZE,
  )

  const invalidateSubmissions = () => queryClient.invalidateQueries({ queryKey: sellSubmissionsKey(slug) })

  const rowActions = (submission: SellSubmission, inArchive: boolean) => ({
    onReview: () => setReviewing(submission),
    onArchive:
      submission.status === 'accepted' && !inArchive
        ? () => archiveSubmission.mutate({ id: submission.id, archived: true })
        : undefined,
    archivePending: archiveSubmission.isPending && archiveSubmission.variables?.id === submission.id,
    onRestore:
      inArchive && submission.status === 'accepted'
        ? () => archiveSubmission.mutate({ id: submission.id, archived: false })
        : undefined,
    restorePending: archiveSubmission.isPending && archiveSubmission.variables?.id === submission.id,
  })

  return (
    <div className="space-y-6">
      <AccordionPanel
        id="sell-submissions"
        defaultOpen
        title="Sell submissions"
        subtitle="Review new offers, then pay out and complete accepted deals (completed submissions stock inventory automatically)."
      >
        <div className="space-y-0">
          {submissionsLoading ? (
            <div className="px-5 py-8">
              <LoadingPanel />
            </div>
          ) : (
            <>
              <div className="-mx-5 flex flex-wrap gap-2 border-b border-border px-5 py-4">
                {(
                  [
                    { id: 'review' as const, label: 'Needs review', count: pendingCount },
                    { id: 'accepted' as const, label: 'Accepted', count: acceptedCount },
                  ] as const
                ).map((item) => {
                  const active = queueTab === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setQueueTab(item.id)}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                        active ? 'bg-brand-500 text-white shadow-sm' : 'text-fg-muted hover:bg-bg',
                      )}
                    >
                      <span>{item.label}</span>
                      {item.id === 'review' && item.count > 0 ? (
                        <span
                          className={cx(
                            'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-none',
                            active ? 'bg-white/25 text-white' : 'bg-brand-700 text-brand-100',
                          )}
                        >
                          {item.count > 99 ? '99+' : item.count}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              {activeQueue.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-fg-muted">
                  {queueTab === 'review'
                    ? 'No new submissions waiting for review.'
                    : 'No accepted submissions awaiting payout. Completed deals may be in the archive below. Use Restore on archived accepted rows.'}
                </p>
              ) : (
                <>
                  <div className="-mx-5 min-w-0 overflow-x-auto">
                    <SubmissionsTable rows={queuePageRows} getRowActions={(submission) => rowActions(submission, false)} />
                  </div>
                  <SubmissionsPagination
                    page={queuePageClamped}
                    totalPages={queueTotalPages}
                    onPageChange={setQueuePage}
                  />
                </>
              )}
            </>
          )}

          <div className="border-t border-border px-5 py-4">
            <Button variant="ghost" onClick={() => setShowArchive((v) => !v)}>
              <Archive className="size-4" aria-hidden />
              {showArchive ? 'Hide' : 'Show'} archive ({archived.length})
            </Button>
            {showArchive && (
              <div className="mt-4 space-y-4">
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
                    <option value="accepted">Accepted</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                  </Select>
                </div>
                {visibleArchive.length === 0 ? (
                  <p className="text-sm text-fg-muted">No archived submissions match.</p>
                ) : (
                  <>
                    <div className="-mx-5 min-w-0 overflow-x-auto border-t border-border">
                      <SubmissionsTable rows={archivePageRows} getRowActions={(submission) => rowActions(submission, true)} />
                    </div>
                    <SubmissionsPagination
                      page={archivePageClamped}
                      totalPages={archiveTotalPages}
                      onPageChange={setArchivePage}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </AccordionPanel>

      <TradeRatesCard slug={slug} rates={rates} />
      <BuylistCard slug={slug} rates={rates} />

      {reviewing && (
        <ReviewSubmissionModal
          slug={slug}
          submission={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={async () => {
            setReviewing(null)
            await invalidateSubmissions()
          }}
          onArchive={
            reviewing.status === 'accepted'
              ? async () => {
                  await archiveSubmission.mutateAsync({ id: reviewing.id, archived: true })
                  setReviewing(null)
                }
              : undefined
          }
          archivePending={archiveSubmission.isPending}
        />
      )}
    </div>
  )
}

/** Half-hour time-of-day choices for the promo window, plus end-of-day. */
const TIME_OPTIONS: { value: string; label: string }[] = [
  ...Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2)
    const minutes = i % 2 === 0 ? '00' : '30'
    const hour12 = hours % 12 === 0 ? 12 : hours % 12
    return { value: `${String(hours).padStart(2, '0')}:${minutes}`, label: `${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}` }
  }),
  { value: '23:59', label: '11:59 PM' },
]

/** Snap an ISO timestamp's local time to the nearest listed option. */
function timeOptionOf(iso: string): string {
  const date = new Date(iso)
  const value = `${String(date.getHours()).padStart(2, '0')}:${date.getMinutes() < 30 ? '00' : '30'}`
  return date.getHours() === 23 && date.getMinutes() === 59 ? '23:59' : value
}

function localDateOf(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
        promoStartDate: settings.promoStartsAt ? localDateOf(settings.promoStartsAt) : '',
        promoStartTime: settings.promoStartsAt ? timeOptionOf(settings.promoStartsAt) : '00:00',
        promoEndDate: settings.promoEndsAt ? localDateOf(settings.promoEndsAt) : '',
        promoEndTime: settings.promoEndsAt ? timeOptionOf(settings.promoEndsAt) : '23:59',
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
      // Date + time dropdowns combine into one local timestamp per boundary;
      // clearing the date clears that boundary.
      if (form.promoStartDate?.trim()) {
        tradeRates.promoStartsAt = new Date(`${form.promoStartDate}T${form.promoStartTime || '00:00'}`).toISOString()
      }
      if (form.promoEndDate?.trim()) {
        tradeRates.promoEndsAt = new Date(`${form.promoEndDate}T${form.promoEndTime || '23:59'}`).toISOString()
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
    <AccordionPanel
      id="trade-rates"
      defaultOpen={false}
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
            (rates.promoActive ? '. Promo rates are LIVE.' : '.')
          : 'Percent of market price paid for trade-ins.'
      }
    >
      <div className="space-y-4">
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
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input label="Starts on" type="date" value={form.promoStartDate ?? ''} onChange={(e) => set('promoStartDate', e.target.value)} />
              <Select label="At" value={form.promoStartTime ?? '00:00'} onChange={(e) => set('promoStartTime', e.target.value)} className="w-28">
                {TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input label="Ends on" type="date" value={form.promoEndDate ?? ''} onChange={(e) => set('promoEndDate', e.target.value)} />
              <Select label="At" value={form.promoEndTime ?? '23:59'} onChange={(e) => set('promoEndTime', e.target.value)} className="w-28">
                {TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            {(form.promoStartDate || form.promoEndDate) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  set('promoStartDate', '')
                  set('promoEndDate', '')
                }}
              >
                Clear promo window
              </Button>
            )}
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
      </div>
    </AccordionPanel>
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
    <AccordionPanel
      id="buy-list"
      defaultOpen={false}
      title="Buy list"
      subtitle="Cards you actively want. Leave the offer blank to pay your premium rate at market; pin a price to lock the per-copy offer."
    >
      <div className="space-y-4">
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
          <EmptyState icon={WalletCards} title="Your buy list is empty" description="Add the cards you want to buy. They appear on your public Sell/Trade page at premium rates." />
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
                    {entry.wantsFoil ? ` · ${entry.wantsFinish}` : ''}
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
      </div>
    </AccordionPanel>
  )
}

/** Orders-style table for sell submission queues. */
function SubmissionsTable({
  rows,
  getRowActions,
}: {
  rows: SellSubmission[]
  getRowActions: (submission: SellSubmission) => {
    onReview: () => void
    onArchive?: () => void
    archivePending?: boolean
    onRestore?: () => void
    restorePending?: boolean
  }
}) {
  return (
    <table className="w-full table-fixed text-left text-sm">
      <thead>
        <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <th className="w-[26%] px-5 py-3 font-semibold">Cards</th>
          <th className="w-[22%] px-5 py-3 font-semibold">Customer</th>
          <th className="w-[14%] px-5 py-3 font-semibold">Submission</th>
          <th className="w-[12%] px-5 py-3 font-semibold">Payout</th>
          <th className="w-[12%] px-5 py-3 font-semibold">Offer</th>
          <th className="w-[10%] px-5 py-3 font-semibold">Status</th>
          <th className="w-[14%] px-3 py-3 text-right font-semibold">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((submission) => (
          <SubmissionTableRow key={submission.id} submission={submission} {...getRowActions(submission)} />
        ))}
      </tbody>
    </table>
  )
}

function SubmissionTableRow({
  submission,
  onReview,
  onArchive,
  archivePending = false,
  onRestore,
  restorePending = false,
}: {
  submission: SellSubmission
  onReview: () => void
  onArchive?: () => void
  archivePending?: boolean
  onRestore?: () => void
  restorePending?: boolean
}) {
  const cardCount = submissionCardCount(submission)
  const statusUi = sellStatusPresentation(submission.status)
  const firstItem = submission.items[0]
  const thumb = firstItem?.imageUris?.small ?? firstItem?.imageUris?.normal

  return (
    <tr className={cx('border-b border-border/60 transition-colors hover:bg-bg/80', SUBMISSION_TABLE_ROW_H)}>
      <td className="px-5 py-4 align-middle">
        <button type="button" onClick={onReview} className="flex w-full items-center gap-3 text-left">
          <span className="grid size-11 shrink-0 overflow-hidden rounded-xl bg-bg">
            {thumb ? (
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-fg-muted">
                <WalletCards aria-hidden className="size-5" />
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fg">{submissionPrimaryLabel(submission)}</span>
            <span className="block text-xs text-fg-muted">{cardCount} cards</span>
          </span>
        </button>
      </td>
      <td className="px-5 py-4 align-middle">
        <div className="flex items-center gap-3">
          <Avatar name={submission.customerName ?? 'Guest'} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{submission.customerName ?? 'Guest'}</p>
            <p className="truncate text-xs text-fg-muted">
              {submission.channel === 'kiosk' ? 'Walk-in' : submission.customerEmail ?? 'Customer'}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 align-middle">
        <p className="font-semibold text-fg">#{submission.id}</p>
        <p className="text-xs text-fg-muted">{formatDate(submission.createdAt)}</p>
      </td>
      <td className="px-5 py-4 align-middle text-fg-muted">
        {submission.payoutMethod === 'credit' ? 'Store credit' : 'Cash'}
      </td>
      <td className="px-5 py-4 align-middle">
        <p className="font-bold text-fg">{formatPrice(submission.totalOfferCents)}</p>
      </td>
      <td className="px-5 py-4 align-middle">
        <span className={cx('inline-flex rounded-lg px-2.5 py-1 text-xs font-bold', statusUi.className)}>{statusUi.label}</span>
      </td>
      <td className="px-3 py-4 align-middle">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {onRestore ? (
            <Button size="sm" variant="ghost" loading={restorePending} onClick={onRestore}>
              Restore
            </Button>
          ) : null}
          {onArchive ? (
            <Button size="sm" variant="ghost" loading={archivePending} onClick={onArchive}>
              Archive
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onReview}>
            {submission.status === 'pending' ? 'Review' : 'Details'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

function SubmissionsPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const set = new Set<number>([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages))
    return [...set].sort((a, b) => a - b)
  }, [page, totalPages])

  if (totalPages <= 1) return null

  return (
    <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted disabled:opacity-40 hover:bg-bg"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Previous
      </button>
      <div className="flex items-center gap-1">
        {pages.map((p, index) => (
          <span key={p} className="flex items-center gap-1">
            {index > 0 && pages[index - 1] !== p - 1 && <span className="px-1 text-fg-muted">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              className={cx(
                'grid size-9 place-items-center rounded-lg text-sm font-bold',
                p === page ? 'bg-brand-500 text-white' : 'text-fg-muted hover:bg-bg',
              )}
            >
              {p}
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg-muted disabled:opacity-40 hover:bg-bg"
      >
        Next
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </div>
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
  onArchive,
  archivePending = false,
}: {
  slug: string
  submission: SellSubmission
  onClose: () => void
  onSaved: () => Promise<void>
  onArchive?: () => void | Promise<void>
  archivePending?: boolean
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
      title={`${isPending ? 'Review' : 'Submission'} #${submission.id}: ${submission.customerName ?? 'Customer'}`}
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
              <Button variant="ghost" loading={archivePending} onClick={() => void onArchive?.()}>
                <Archive className="size-4" aria-hidden />
                Archive
              </Button>
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
          <td>${escapeHtml(item.cardName)}${item.isFoil ? ' (' + escapeHtml(item.finish) + ')' : ''}</td>
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
          <h1>Sell submission #${submission.id}. ${escapeHtml(submission.customerName ?? 'Customer')}</h1>
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
