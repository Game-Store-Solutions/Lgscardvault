import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageOff, List, Plus, Search, Trash2, X } from 'lucide-react'
import api, { cardImage } from '../../api/client'
import type { CardSummary, CustomerWantListEntry } from '../../api/types'
import { customerKeys, useDebouncedValue, useMyWantList } from '../../hooks'
import { Badge, Button, EmptyState, ErrorState, Input, LoadingPanel, Pagination, Select, Spinner, Textarea } from '../ui'
import { ProfileSection } from '../profile'
import { ACCOUNT_PAGE_SIZE } from '../../api/client'

type StoreOption = { slug: string; name: string }

export function WantListPanel({
  stores,
  storeSlug,
}: {
  stores: StoreOption[]
  storeSlug?: string
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useMyWantList(page, storeSlug)

  useEffect(() => {
    setPage(1)
  }, [storeSlug])

  const removeMutation = useMutation({
    mutationFn: async (entry: CustomerWantListEntry) => {
      const slug = entry.storeSlug
      if (!slug) throw new Error('Missing store')
      await api.delete(`/stores/${slug}/customer/want-list/${entry.id}`)
      return slug
    },
    onSuccess: (slug) => {
      void queryClient.invalidateQueries({ queryKey: ['my-want-list'] })
      void queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) })
    },
  })

  const entries = query.data?.items ?? []

  return (
    <ProfileSection title="Want list">
      <WantListAddForm stores={stores} defaultStoreSlug={storeSlug} />

      {query.isLoading ? (
        <LoadingPanel label="Loading want list…" />
      ) : query.isError ? (
        <ErrorState title="Could not load your want list." onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={List}
          title="Nothing on your list yet"
          description="Search the catalog above, pick a store, and tell them what you are looking for."
        />
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border/80">
          {entries.map((entry) => {
            const slug = entry.storeSlug
            const detailHref = slug && entry.inventoryItemId ? `/s/${slug}/cards/${entry.inventoryItemId}` : null
            const main = (
              <>
                <div className="grid h-[4.25rem] w-[3.1rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-bg ring-1 ring-border/60">
                  {entry.card && cardImage(entry.card) ? (
                    <img src={cardImage(entry.card)} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageOff aria-hidden className="size-5 text-fg-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-fg group-hover:text-brand-600">{entry.cardName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                    {entry.storeName ? <Badge tone="brand">{entry.storeName}</Badge> : null}
                    {entry.setCode ? <Badge>{entry.setCode.toUpperCase()}</Badge> : null}
                    <Badge tone={entry.isFoil ? 'brand' : 'neutral'}>{entry.finish}</Badge>
                    <span className="font-medium">Qty {entry.quantity}</span>
                  </div>
                  {entry.notes ? <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{entry.notes}</p> : null}
                  {detailHref ? (
                    <p className="mt-1 text-xs font-semibold text-brand-600">View in store →</p>
                  ) : (
                    <p className="mt-1 text-xs text-fg-muted">Not listed at this store yet</p>
                  )}
                </div>
              </>
            )

            return (
              <li key={`${entry.storeSlug ?? 'store'}-${entry.id}`} className="border-b border-border/70 last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                  {detailHref ? (
                    <Link
                      to={detailHref}
                      className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5 transition-colors hover:bg-bg/60 sm:gap-4"
                    >
                      {main}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">{main}</div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-fg-muted hover:text-danger-700"
                    loading={removeMutation.isPending && removeMutation.variables?.id === entry.id}
                    onClick={() => removeMutation.mutate(entry)}
                    aria-label={`Remove ${entry.cardName} from want list`}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Pagination
        className="mt-4"
        page={page}
        pageCount={Math.max(1, Math.ceil((query.data?.total ?? 0) / ACCOUNT_PAGE_SIZE))}
        onPageChange={setPage}
        totalItems={query.data?.total}
      />
    </ProfileSection>
  )
}

function WantListAddForm({
  stores,
  defaultStoreSlug,
}: {
  stores: StoreOption[]
  defaultStoreSlug?: string
}) {
  const queryClient = useQueryClient()
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<CardSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [isFoil, setIsFoil] = useState(false)
  const [notes, setNotes] = useState('')
  const [targetSlug, setTargetSlug] = useState(defaultStoreSlug ?? '')
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setTargetSlug(defaultStoreSlug ?? '')
  }, [defaultStoreSlug])

  const debouncedTerm = useDebouncedValue(term.trim(), 250)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const searchQuery = useQuery({
    queryKey: ['catalog-search', debouncedTerm],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', { params: { q: debouncedTerm } })
      return data
    },
    enabled: debouncedTerm.length >= 2 && !selected,
  })

  const results = searchQuery.data ?? []
  const cardName = (selected?.name ?? term).trim()

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!targetSlug) throw new Error('Pick a store')
      await api.post(`/stores/${targetSlug}/customer/want-list`, {
        cardId: selected?.id,
        cardName,
        setCode: selected?.setCode ?? '',
        isFoil,
        quantity,
        notes,
      })
      return targetSlug
    },
    onSuccess: (slug) => {
      setTerm('')
      setSelected(null)
      setQuantity(1)
      setIsFoil(false)
      setNotes('')
      void queryClient.invalidateQueries({ queryKey: ['my-want-list'] })
      void queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) })
    },
  })

  function pickCard(card: CardSummary) {
    setSelected(card)
    setTerm(card.name)
    setOpen(false)
  }

  function clearSelection() {
    setSelected(null)
    setTerm('')
    setOpen(false)
  }

  return (
    <div className="mb-5 rounded-2xl bg-bg/70 p-4 ring-1 ring-border/70 sm:p-5">
      <p className="text-sm font-bold text-fg">Add a card</p>
      <p className="mt-0.5 text-xs text-fg-muted">
        Search the whole catalog, then pick which store should watch for it.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (cardName.length > 0 && targetSlug) addMutation.mutate()
        }}
        className="mt-4 space-y-3"
      >
        <div ref={boxRef} className="relative">
          <label htmlFor="wantlist-card-search" className="sr-only">
            Search for a card
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              id="wantlist-card-search"
              type="text"
              autoComplete="off"
              value={term}
              placeholder="Search cards (e.g. Sol Ring)"
              onChange={(event) => {
                setTerm(event.target.value)
                if (selected) setSelected(null)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              className="w-full rounded-xl border-0 bg-surface py-2.5 pl-9 pr-9 text-sm text-fg shadow-sm ring-1 ring-border/80 outline-none focus:ring-2 focus:ring-brand-500/35"
            />
            {searchQuery.isFetching && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
            {!searchQuery.isFetching && term ? (
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fg-muted hover:bg-bg"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>

          {open && !selected && debouncedTerm.length >= 2 ? (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-border/80">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-fg-muted">
                  {searchQuery.isFetching ? 'Searching…' : 'No matching cards.'}
                </p>
              ) : (
                results.map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    onClick={() => pickCard(card)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-bg"
                  >
                    <span className="grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded bg-bg ring-1 ring-border/60">
                      {cardImage(card) ? (
                        <img src={cardImage(card)} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageOff aria-hidden className="size-4 text-fg-muted" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{card.name}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {(card.setCode ?? '—').toUpperCase()} · {card.rarity ?? 'unknown'}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {selected ? (
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-border/70">
            <Badge tone="brand">{selected.setCode?.toUpperCase() ?? '—'}</Badge>
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{selected.name}</span>
            <button type="button" onClick={clearSelection} aria-label="Remove selected card" className="text-fg-muted hover:text-fg">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}

        <Select
          label="Place at store"
          value={targetSlug}
          onChange={(event) => setTargetSlug(event.target.value)}
          required
        >
          <option value="">Choose a store</option>
          {stores.map((store) => (
            <option key={store.slug} value={store.slug}>
              {store.name}
            </option>
          ))}
        </Select>

        <div className="grid gap-3 sm:grid-cols-[5rem_1fr_auto] sm:items-end">
          <Input
            label="Qty"
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          />
          <label className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm text-fg ring-1 ring-border/70 sm:mb-0 sm:mt-6">
            <input
              type="checkbox"
              className="size-4 rounded border-border accent-brand-500"
              checked={isFoil}
              onChange={(event) => setIsFoil(event.target.checked)}
            />
            Foil
          </label>
          <Button
            type="submit"
            loading={addMutation.isPending}
            disabled={cardName.length === 0 || !targetSlug}
            className="sm:mt-6"
          >
            <Plus aria-hidden className="size-4" />
            Add
          </Button>
        </div>

        <Textarea
          label="Notes (optional)"
          rows={2}
          placeholder="Condition, budget, language…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {addMutation.isError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            Could not add to your want list. Please try again.
          </p>
        ) : null}
      </form>
    </div>
  )
}
