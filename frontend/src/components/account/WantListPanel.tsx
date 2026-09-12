import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, ImageOff, List, Plus, Search, Trash2, X } from 'lucide-react'
import api, { ACCOUNT_PAGE_SIZE, WANT_LIST_MAX, cardImage, extractErrorMessage } from '../../api/client'
import type { CardSummary, CustomerWantListEntry } from '../../api/types'
import { customerKeys, useCatalogGames, useCardPrintings, useDebouncedValue, useMyWantList } from '../../hooks'
import { CatalogResultCard, PrintingGrid } from '../catalog'
import { Badge, Button, EmptyState, ErrorState, Input, LoadingPanel, Pagination, Select, Skeleton, Spinner, Textarea } from '../ui'
import { CardImage } from '../cards'
import { ProfileSection } from '../profile'
import { finishChoices } from '../../lib/finishes'
import { cx } from '../../lib/cx'
import { WantListBulkForm } from './WantListBulkForm'

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
  const [addMode, setAddMode] = useState<'search' | 'paste'>('search')
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
      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAddMode('search')}
          className={cx(
            'inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ring-1 transition-colors',
            addMode === 'search'
              ? 'bg-brand-500 text-white ring-brand-500'
              : 'bg-surface text-fg ring-border hover:bg-bg',
          )}
        >
          <Search aria-hidden className="size-4" />
          Search catalog
        </button>
        <button
          type="button"
          onClick={() => setAddMode('paste')}
          className={cx(
            'inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ring-1 transition-colors',
            addMode === 'paste'
              ? 'bg-brand-500 text-white ring-brand-500'
              : 'bg-surface text-fg ring-border hover:bg-bg',
          )}
        >
          <ClipboardList aria-hidden className="size-4" />
          Paste a list
        </button>
      </div>
      {addMode === 'search' ? (
        <WantListAddForm stores={stores} defaultStoreSlug={storeSlug} />
      ) : (
        <WantListBulkForm stores={stores} defaultStoreSlug={storeSlug} />
      )}

      {query.isLoading ? (
        <LoadingPanel bare label="Loading want list…" />
      ) : query.isError ? (
        <ErrorState title="Could not load your want list." onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={List}
          title="Nothing on your list yet"
          description="Search above and pick a printing to tell a store what you are looking for."
        />
      ) : (
        <ul className="grid grid-cols-2 justify-start gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(14.5rem,14.5rem))] sm:gap-x-4 sm:gap-y-5">
          {entries.map((entry) => (
            <WantListCard
              key={`${entry.storeSlug ?? 'store'}-${entry.id}`}
              entry={entry}
              removing={removeMutation.isPending && removeMutation.variables?.id === entry.id}
              onRemove={() => removeMutation.mutate(entry)}
            />
          ))}
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

function WantListCard({
  entry,
  removing,
  onRemove,
}: {
  entry: CustomerWantListEntry
  removing: boolean
  onRemove: () => void
}) {
  const image = entry.card ? cardImage(entry.card) : undefined
  const detailHref =
    entry.storeSlug && entry.inventoryItemId ? `/s/${entry.storeSlug}/cards/${entry.inventoryItemId}` : null

  const art = (
    <div className="overflow-hidden rounded-xl bg-bg shadow-sm ring-1 ring-border">
      <CardImage src={image} alt={entry.cardName} showLabel={false} fit="cover" className="aspect-[63/88] w-full" />
    </div>
  )

  return (
    <li className="min-w-0">
      <div className="relative">
        {detailHref ? (
          <Link to={detailHref} className="block transition-opacity hover:opacity-90">
            {art}
          </Link>
        ) : (
          art
        )}
        <span
          className={
            entry.inStock
              ? 'pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-success-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm'
              : 'pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-warning-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm'
          }
        >
          {entry.inStock ? 'In store' : 'Not in store'}
        </span>
        <button
          type="button"
          className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-lg bg-surface/95 text-fg shadow-sm ring-1 ring-border hover:bg-bg hover:text-danger-700"
          disabled={removing}
          onClick={onRemove}
          aria-label={`Remove ${entry.cardName} from want list`}
        >
          <Trash2 aria-hidden className="size-5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {entry.storeName ? (
          <Badge tone="brand" className="px-2 py-0 text-[11px]">
            {entry.storeName}
          </Badge>
        ) : null}
        {entry.setCode ? <Badge className="px-2 py-0 text-[11px]">{entry.setCode.toUpperCase()}</Badge> : null}
        <Badge tone={entry.isFoil ? 'brand' : 'neutral'} className="px-2 py-0 text-[11px]">
          {entry.finish}
        </Badge>
        <Badge className="px-2 py-0 text-[11px]">Qty {entry.quantity}</Badge>
      </div>
      {entry.notes ? <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{entry.notes}</p> : null}
    </li>
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
  const { data: games = [] } = useCatalogGames()
  const gameOptions = useMemo(
    () => games.map((game) => ({ code: game.code, name: game.name })),
    [games],
  )
  const [gameFilter, setGameFilter] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [nameHit, setNameHit] = useState<CardSummary | null>(null)
  const [selected, setSelected] = useState<CardSummary | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [isFoil, setIsFoil] = useState(false)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [targetSlug, setTargetSlug] = useState(defaultStoreSlug ?? '')
  const [printingFilter, setPrintingFilter] = useState('')
  const skipAutoOpenQuery = useRef<string | null>(null)

  const needsStorePicker = stores.length > 1 && !defaultStoreSlug
  const resolvedSlug = defaultStoreSlug || (stores.length === 1 ? stores[0].slug : targetSlug)
  const usage = useMyWantList(1, resolvedSlug || undefined, Boolean(resolvedSlug))
  const used = usage.data?.total ?? 0
  const remaining = Math.max(0, WANT_LIST_MAX - used)

  useEffect(() => {
    if (defaultStoreSlug) {
      setTargetSlug(defaultStoreSlug)
      return
    }
    if (stores.length === 1) setTargetSlug(stores[0].slug)
  }, [defaultStoreSlug, stores])

  useEffect(() => {
    if (!gameFilter && gameOptions.length > 0) {
      setGameFilter(gameOptions[0].code)
    }
  }, [gameFilter, gameOptions])

  const debouncedTerm = useDebouncedValue(catalogSearch.trim(), 350)
  const searchReady = debouncedTerm.length >= 3 && Boolean(gameFilter) && !selected && !nameHit

  const { data: catalogResults = [], isFetching, isError } = useQuery({
    queryKey: ['wantlist-card-search', 'unique-cards', debouncedTerm, gameFilter],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: debouncedTerm,
          unique: 'cards',
          ...(gameFilter ? { game: gameFilter } : {}),
        },
      })
      return data
    },
    enabled: searchReady,
  })

  const printingsQuery = useCardPrintings(nameHit?.id, Boolean(nameHit) && !selected)
  const printings = printingsQuery.data ?? []
  const visiblePrintings = useMemo(() => {
    const needle = printingFilter.trim().toLowerCase()
    if (!needle) return printings
    return printings.filter((card) => {
      const haystack = [card.setCode, card.setName, card.collectorNumber, card.lang]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [printings, printingFilter])

  useEffect(() => {
    setPrintingFilter('')
  }, [nameHit?.id])

  useEffect(() => {
    if (!searchReady || nameHit || selected || isFetching) return
    const live = foldSearch(catalogSearch)
    const query = foldSearch(debouncedTerm)
    if (live !== query) return
    if (skipAutoOpenQuery.current === query) return
    const first = catalogResults[0]
    if (!first) return
    const name = foldSearch(first.name)
    if (catalogResults.length === 1 || name === query) {
      skipAutoOpenQuery.current = query
      setNameHit(first)
    }
  }, [catalogResults, catalogSearch, debouncedTerm, isFetching, nameHit, searchReady, selected])

  useEffect(() => {
    if (!nameHit || selected) return
    if (printingsQuery.isPending || printingsQuery.isFetching) return
    if (printingsQuery.isError) {
      pickPrinting(nameHit)
      return
    }
    if (printings.length <= 1) pickPrinting(printings[0] ?? nameHit)
  }, [nameHit, selected, printings, printingsQuery.isPending, printingsQuery.isFetching, printingsQuery.isError])

  const selectedFinishes = finishChoices(selected, gameFilter)
  const selectedImage = selected ? cardImage(selected) : undefined

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !resolvedSlug) throw new Error('Pick a card from the catalog')
      await api.post(`/stores/${resolvedSlug}/customer/want-list`, {
        cardId: selected.id,
        cardName: selected.name,
        setCode: selected.setCode ?? '',
        isFoil,
        quantity,
        notes,
      })
      return resolvedSlug
    },
    onSuccess: (slug) => {
      skipAutoOpenQuery.current = null
      setCatalogSearch('')
      setNameHit(null)
      setSelected(null)
      setQuantity(1)
      setIsFoil(false)
      setNotes('')
      setShowNotes(false)
      void queryClient.invalidateQueries({ queryKey: ['my-want-list'] })
      void queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) })
    },
  })

  function pickPrinting(card: CardSummary) {
    const finishes = finishChoices(card)
    setSelected(card)
    setIsFoil(finishes.hasFoil && !finishes.hasPlain)
  }

  function clearSelection() {
    skipAutoOpenQuery.current = foldSearch(catalogSearch) || foldSearch(debouncedTerm)
    setNameHit(null)
    setSelected(null)
    setQuantity(1)
    setIsFoil(false)
    setShowNotes(false)
    setNotes('')
    setPrintingFilter('')
  }

  const showNameResults = !nameHit && !selected && searchReady
  const showPrintings = Boolean(nameHit) && !selected && printings.length > 1

  return (
    <div className="mb-6 border-b border-border pb-5">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (selected && resolvedSlug && remaining > 0) addMutation.mutate()
        }}
        className="space-y-3"
      >
        {selected ? (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-24 w-[4.35rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-bg ring-1 ring-border/70">
                {selectedImage ? (
                  <CardImage src={selectedImage} alt="" showLabel={false} fit="cover" className="size-full" />
                ) : (
                  <ImageOff aria-hidden className="size-6 text-fg-muted" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{selected.name}</p>
                <p className="truncate text-xs text-fg-muted">
                  {(selected.setCode ?? '—').toUpperCase()}
                  {selected.collectorNumber ? ` · #${selected.collectorNumber}` : ''}
                  {selected.setName ? ` · ${selected.setName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="text-sm font-semibold text-fg-muted hover:text-fg"
              >
                Change
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              {needsStorePicker ? (
                <Select
                  label="Store"
                  value={targetSlug}
                  onChange={(event) => setTargetSlug(event.target.value)}
                  wrapperClassName="min-w-[10rem] flex-1"
                  required
                >
                  <option value="">Choose a store</option>
                  {stores.map((store) => (
                    <option key={store.slug} value={store.slug}>
                      {store.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Input
                label="Qty"
                type="number"
                min={1}
                max={999}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                wrapperClassName="w-[4.5rem]"
              />
              {selectedFinishes.hasFoil ? (
                <label className="flex h-10 items-center gap-2 rounded-[var(--radius-input)] border border-border bg-bg px-3 text-sm text-fg">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border accent-brand-500"
                    checked={isFoil}
                    onChange={(event) => setIsFoil(event.target.checked)}
                  />
                  {selectedFinishes.foil}
                </label>
              ) : null}
              <Button
                type="submit"
                loading={addMutation.isPending}
                disabled={!resolvedSlug || remaining === 0}
                className="ml-auto"
              >
                <Plus aria-hidden className="size-4" />
                Add
              </Button>
            </div>

            {showNotes ? (
              <div className="mt-3">
                <Textarea
                  label="Notes"
                  rows={2}
                  placeholder="Condition, budget, language…"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="mt-3 text-sm font-medium text-fg-muted hover:text-fg"
              >
                Add a note
              </button>
            )}
          </div>
        ) : nameHit ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">{nameHit.name}</p>
              <p className="text-xs text-fg-muted">Pick a printing</p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm font-semibold text-fg-muted hover:text-fg"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {gameOptions.length > 1 ? (
              <Select
                aria-label="Game"
                value={gameFilter}
                onChange={(event) => {
                  setGameFilter(event.target.value)
                  setNameHit(null)
                  setSelected(null)
                }}
                wrapperClassName="sm:w-48"
              >
                {gameOptions.map((game) => (
                  <option key={game.code} value={game.code}>
                    {game.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
              />
              <input
                id="wantlist-card-search"
                type="text"
                autoComplete="off"
                value={catalogSearch}
                placeholder="Search cards…"
                aria-label="Search cards"
                onChange={(event) => setCatalogSearch(event.target.value)}
                className="h-10 w-full rounded-[var(--radius-input)] border border-border bg-bg py-2 pl-9 pr-9 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              />
              {isFetching ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner size="sm" />
                </span>
              ) : catalogSearch ? (
                <button
                  type="button"
                  onClick={() => {
                    skipAutoOpenQuery.current = foldSearch(debouncedTerm) || skipAutoOpenQuery.current
                    setCatalogSearch('')
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fg-muted hover:bg-bg hover:text-fg"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {isError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            Could not search the catalog. Please try again.
          </p>
        ) : null}

        {showNameResults && catalogResults.length > 0 ? (
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
            {catalogResults.map((card) => (
              <li key={card.id}>
                <CatalogResultCard compact card={card} selected={false} onSelect={() => setNameHit(card)} />
              </li>
            ))}
          </ul>
        ) : null}

        {showNameResults && !isFetching && catalogResults.length === 0 ? (
          <p className="text-sm text-fg-muted">No matching cards. Try another spelling.</p>
        ) : null}

        {nameHit && !selected && (printingsQuery.isPending || printingsQuery.isFetching) && printings.length === 0 ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2"
            aria-busy="true"
            aria-label="Loading printings"
          >
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl ring-1 ring-border">
                <Skeleton className="aspect-[5/7] w-full rounded-none" />
                <div className="space-y-1.5 p-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {showPrintings ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-fg-muted">
                {printings.length} {printings.length === 1 ? 'printing' : 'printings'} of {nameHit?.name}
              </p>
              {printings.length > 8 ? (
                <Input
                  value={printingFilter}
                  onChange={(event) => setPrintingFilter(event.target.value)}
                  placeholder="Filter set, #, or language…"
                  aria-label="Filter printings"
                  wrapperClassName="sm:w-64"
                />
              ) : null}
            </div>
            {visiblePrintings.length === 0 ? (
              <p className="text-sm text-fg-muted">No printings match that filter.</p>
            ) : (
              <div className="max-h-[32rem] overflow-x-hidden overflow-y-auto pr-1">
                <PrintingGrid
                  items={visiblePrintings}
                  selectedId={null}
                  finish="nonfoil"
                  onSelect={pickPrinting}
                  showIndex={false}
                  size="sm"
                />
              </div>
            )}
          </div>
        ) : null}

        {resolvedSlug ? (
          <p className="text-sm text-fg-muted">
            {used} / {WANT_LIST_MAX} cards at this store
            {remaining === 0 ? ' — list is full.' : '.'}
          </p>
        ) : null}

        {addMutation.isError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(addMutation.error, 'Could not add to your want list. Please try again.')}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function foldSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
