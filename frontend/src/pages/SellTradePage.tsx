import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, ClipboardList, Search, Trash2, WalletCards, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice } from '../api/client'
import type { BuylistEntry, SellSubmission } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { useStore, useStoreTheme } from '../hooks'
import { Badge, Button, buttonVariants, Card, CardBody, CardHeader, EmptyState, Input, LoadingPanel, Textarea } from '../components/ui'
import { formatDate } from '../lib/format'

const buylistKey = (slug: string) => ['buylist', slug] as const
const mySubmissionsKey = (slug: string) => ['my-sell-submissions', slug] as const

const STATUS_TONE: Record<SellSubmission['status'], 'brand' | 'success' | 'danger' | 'neutral'> = {
  pending: 'brand',
  accepted: 'success',
  completed: 'success',
  declined: 'danger',
}

interface CartLine {
  entry: BuylistEntry
  quantity: number
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

/**
 * Sell/Trade portal: browse the store's buy list, build a submission (by
 * search or by pasting a decklist/CSV of names), and track past submissions.
 */
export default function SellTradePage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const queryClient = useQueryClient()

  const { data: buylist = [], isLoading } = useQuery({
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

  const [filter, setFilter] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [decklistOpen, setDecklistOpen] = useState(false)
  const [decklist, setDecklist] = useState('')
  const [unmatched, setUnmatched] = useState<string[]>([])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return buylist
    return buylist.filter((entry) => (entry.card?.name ?? '').toLowerCase().includes(q))
  }, [buylist, filter])

  const totalCents = lines.reduce((sum, line) => sum + line.entry.offerCents * line.quantity, 0)

  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SellSubmission>(`/stores/${slug}/sell-submissions`, {
        items: lines.map((line) => ({ buylistEntryId: line.entry.id, quantity: line.quantity })),
      })
      return data
    },
    onSuccess: async () => {
      setLines([])
      await queryClient.invalidateQueries({ queryKey: mySubmissionsKey(slug) })
    },
  })

  function addLine(entry: BuylistEntry, quantity = 1) {
    setLines((current) => {
      const existing = current.find((line) => line.entry.id === entry.id)
      const cap = entry.maxQuantity ?? Number.POSITIVE_INFINITY
      if (existing) {
        return current.map((line) =>
          line.entry.id === entry.id ? { ...line, quantity: Math.min(line.quantity + quantity, cap) } : line,
        )
      }
      return [...current, { entry, quantity: Math.min(quantity, cap) }]
    })
  }

  function importDecklist() {
    const wanted = parseDecklist(decklist)
    const misses: string[] = []
    for (const [name, quantity] of wanted) {
      // Prefer the nonfoil entry when the store buys both finishes.
      const matches = buylist.filter((entry) => (entry.card?.name ?? '').toLowerCase() === name)
      const match = matches.find((entry) => !entry.wantsFoil) ?? matches[0]
      if (match) addLine(match, quantity)
      else misses.push(name)
    }
    setUnmatched(misses)
    setDecklist('')
    setDecklistOpen(false)
  }

  return (
    <div className="space-y-6">
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
          {store?.name ?? 'This store'} buys these cards. Build your list — search below or paste a decklist — and
          submit it; the store will confirm before you bring the cards in.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Input label="Search the buy list" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Card name…" />
            </div>
            <Button variant="secondary" onClick={() => setDecklistOpen((v) => !v)}>
              <ClipboardList className="size-4" aria-hidden />
              Paste a decklist
            </Button>
          </div>

          {decklistOpen && (
            <Card>
              <CardBody className="space-y-3">
                <Textarea
                  label="One card per line — quantities like “4x” are optional"
                  rows={6}
                  value={decklist}
                  onChange={(e) => setDecklist(e.target.value)}
                  placeholder={'4 Lightning Bolt\n2x Counterspell\nSol Ring'}
                  className="font-mono text-sm"
                />
                <Button onClick={importDecklist} disabled={!decklist.trim()}>
                  Match against buy list
                </Button>
              </CardBody>
            </Card>
          )}

          {unmatched.length > 0 && (
            <p className="rounded-btn border border-warning-500/30 bg-warning-50 px-3 py-2 text-sm text-warning-700">
              Not on the buy list: {unmatched.join(', ')}
            </p>
          )}

          {isLoading ? (
            <LoadingPanel />
          ) : visible.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={Search}
                  title={buylist.length === 0 ? 'No buy list yet' : 'No matches'}
                  description={
                    buylist.length === 0
                      ? 'This store has not published cards it wants to buy. Check back soon.'
                      : 'Try a different name.'
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <ul className="space-y-2">
              {visible.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card">
                  {entry.card && cardImage(entry.card) && (
                    <img src={cardImage(entry.card)} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-fg">{entry.card?.name ?? 'Unknown card'}</p>
                    <p className="text-xs text-fg-muted">
                      {entry.card?.setCode?.toUpperCase() ?? '—'}
                      {entry.wantsFoil ? ' · Foil' : ''}
                      {entry.maxQuantity != null ? ` · buying up to ${entry.maxQuantity}` : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-lg font-bold text-success-700">{formatPrice(entry.offerCents)}</span>
                  <Button size="sm" variant="secondary" onClick={() => addLine(entry)}>
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Submission builder */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader title="Your submission" subtitle={lines.length === 0 ? 'Add cards from the buy list.' : undefined} />
            <CardBody className="space-y-3">
              {lines.map((line) => (
                <div key={line.entry.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-bold text-fg">
                    {line.entry.card?.name}
                    {line.entry.wantsFoil ? ' (Foil)' : ''}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={line.entry.maxQuantity ?? undefined}
                    value={line.quantity}
                    aria-label={`Quantity of ${line.entry.card?.name ?? 'card'}`}
                    onChange={(e) => {
                      const cap = line.entry.maxQuantity ?? Number.POSITIVE_INFINITY
                      const next = Math.max(1, Math.min(Number(e.target.value) || 1, cap))
                      setLines((current) => current.map((l) => (l.entry.id === line.entry.id ? { ...l, quantity: next } : l)))
                    }}
                    className="w-16 rounded-btn border border-border bg-surface px-2 py-1 text-fg"
                  />
                  <span className="w-16 text-right font-bold text-fg">{formatPrice(line.entry.offerCents * line.quantity)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${line.entry.card?.name ?? 'card'}`}
                    onClick={() => setLines((current) => current.filter((l) => l.entry.id !== line.entry.id))}
                    className="rounded-full p-1 text-fg-muted hover:bg-bg hover:text-danger-700"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}

              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-bold text-fg">Store pays</span>
                <span className="font-display text-2xl font-extrabold text-success-700">{formatPrice(totalCents)}</span>
              </div>

              {user ? (
                <Button className="w-full" size="lg" loading={submit.isPending} disabled={lines.length === 0} onClick={() => submit.mutate()}>
                  <BadgeCheck aria-hidden className="size-4" />
                  Submit to {store?.name ?? 'store'}
                </Button>
              ) : (
                <Link to="/login" className={`${buttonVariants({ variant: 'primary', size: 'lg' })} w-full`}>
                  Sign in to submit
                </Link>
              )}
              {lines.length > 0 && (
                <Button variant="ghost" className="w-full text-danger-700" onClick={() => setLines([])}>
                  <Trash2 aria-hidden className="size-4" />
                  Clear
                </Button>
              )}
              {submit.isError && (
                <p role="alert" className="text-sm font-medium text-danger-700">
                  {extractErrorMessage(submit.error, 'Could not submit your list.')}
                </p>
              )}
              {submit.isSuccess && lines.length === 0 && (
                <p role="status" className="rounded-btn border border-success-500/30 bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
                  Submitted! The store will review it — check the status below.
                </p>
              )}
            </CardBody>
          </Card>

          {user && (submissionsQuery.data?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Your past submissions" />
              <CardBody className="space-y-3">
                {submissionsQuery.data!.map((submission) => (
                  <div key={submission.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-fg">{formatPrice(submission.totalOfferCents)}</p>
                      <p className="text-xs text-fg-muted">
                        {submission.items.reduce((n, item) => n + item.quantity, 0)} cards · {formatDate(submission.createdAt)}
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
        </aside>
      </div>
    </div>
  )
}
