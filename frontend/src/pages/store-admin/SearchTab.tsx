import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import api, { extractErrorMessage, parsePriceInput } from '../../api/client'
import type { CardSummary, InventoryItem } from '../../api/types'
import { inventoryKey, inventoryPageKey, useCardPrintings, useCatalogGames, useDebouncedValue, useGameSets, useInventoryPage, useStoreGameStats } from '../../hooks'
import { GameWorkspaceHeader, PrintingGrid, SetCodeTypeahead } from '../../components/catalog'
import { AnimatePresence, EASE_PREMIUM, motion, Stagger, StaggerItem } from '../../components/motion'
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Select,
  Field,
  Button,
  EmptyState,
  Pagination,
  InventoryAdminListSkeleton,
  Spinner,
  dropdownItemClass,
  dropdownPanelClass,
} from '../../components/ui'
import { cx } from '../../lib/cx'
import { type Condition } from '../../components/inventory'
import { defaultFinishFor, finishChoices, finishOptions, isFoilFinish } from '../../lib/finishes'
import { listingMarketSummary } from '../../lib/marketFinishes'
import { rankInventorySearch } from '../../lib/rankInventorySearch'
import { foldSearchText, catalogCardIdentity, catalogNamesMatch, typeaheadNameTier } from '../../lib/searchText'
import {
  CatalogResultCard,
  EditInventoryModal,
  InventoryFloatingCard,
  InventoryResultCard,
  SelectedCardEditor,
  type InventoryEditPayload,
} from './search'

/** Inventory cards shown per page in the admin grid. */
const INVENTORY_PAGE_SIZE = 24
/** Suggestions pulled for the Search stock name typeahead (inventory only). */
const INVENTORY_TYPEAHEAD_SIZE = 48
/** Persist layout so returning to Search stock stays on the chosen view. */
const STOCK_VIEW_KEY = 'lgs.admin.inventoryStockView'

type StockView = 'list' | 'cards'

function readStockView(): StockView {
  try {
    return localStorage.getItem(STOCK_VIEW_KEY) === 'cards' ? 'cards' : 'list'
  } catch {
    return 'list'
  }
}

function printingHasFinish(card: CardSummary, finish: 'foil' | 'nonfoil'): boolean {
  const choices = finishChoices(card)
  return finish === 'foil' ? choices.hasFoil : choices.hasPlain
}

export default function SearchTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState('')
  const [inventorySetFilter, setInventorySetFilter] = useState('')
  const [inventoryFinishFilter, setInventoryFinishFilter] = useState<'all' | 'foil' | 'nonfoil'>('all')
  const [gameFilter, setGameFilter] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogSetFilter, setCatalogSetFilter] = useState('')
  const [catalogFinishFilter, setCatalogFinishFilter] = useState<'all' | 'foil' | 'nonfoil'>('all')
  const [selectedCard, setSelectedCard] = useState<CardSummary | null>(null)
  const [nameHit, setNameHit] = useState<CardSummary | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [priceText, setPriceText] = useState('')
  const [condition, setCondition] = useState<Condition>('NM')
  const [finish, setFinish] = useState('Nonfoil')
  const [costText, setCostText] = useState('')
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const addEditorRef = useRef<HTMLDivElement>(null)

  // Seed the sell price from the market price when there is one. Games
  // outside Magic often have no price at all, and the old flow silently
  // listed those at $0.00 with no way to say otherwise.
  function applyScryfallPrice(card: CardSummary, nextFinish: string) {
    const market = listingMarketSummary(card, isFoilFinish(nextFinish), nextFinish)
    setPriceText(market.priceCents == null ? '' : (market.priceCents / 100).toFixed(2))
  }

  const [invPage, setInvPage] = useState(1)
  const [stockView, setStockView] = useState<StockView>(readStockView)
  const [typeaheadIndex, setTypeaheadIndex] = useState(0)
  const [typeaheadOpen, setTypeaheadOpen] = useState(false)
  const typeaheadRef = useRef<HTMLDivElement>(null)

  function chooseStockView(next: StockView) {
    setStockView(next)
    try {
      localStorage.setItem(STOCK_VIEW_KEY, next)
    } catch {
      /* private mode / quota — preference just won't stick */
    }
  }
  const [invTypeaheadIndex, setInvTypeaheadIndex] = useState(0)
  const [invTypeaheadOpen, setInvTypeaheadOpen] = useState(false)
  const invTypeaheadRef = useRef<HTMLDivElement>(null)
  const debouncedFilter = useDebouncedValue(filter.trim(), 300)
  const debouncedInventorySet = useDebouncedValue(inventorySetFilter.trim(), 300)
  const debouncedCatalogSearch = useDebouncedValue(catalogSearch.trim(), 150)

  const inventoryQuery = useInventoryPage(slug, {
    game: gameFilter || undefined,
    q: debouncedFilter,
    set: debouncedInventorySet,
    finish: inventoryFinishFilter,
    page: invPage,
    itemsPerPage: INVENTORY_PAGE_SIZE,
    enabled: Boolean(gameFilter),
  })
  const inventory = useMemo(
    () => rankInventorySearch(inventoryQuery.data?.items ?? [], debouncedFilter),
    [inventoryQuery.data?.items, debouncedFilter],
  )
  const inventoryTotal = inventoryQuery.data?.total ?? 0
  const listingsLoading = inventoryQuery.isPending && !inventoryQuery.data
  const listingsRefreshing = inventoryQuery.isFetching && inventoryQuery.isPlaceholderData

  const invTypeaheadReady = debouncedFilter.length >= 2 && Boolean(gameFilter)
  const { data: invTypeaheadPage, isFetching: invTypeaheadFetching } = useInventoryPage(slug, {
    game: gameFilter || undefined,
    q: debouncedFilter,
    set: debouncedInventorySet,
    finish: inventoryFinishFilter,
    page: 1,
    itemsPerPage: INVENTORY_TYPEAHEAD_SIZE,
    enabled: invTypeaheadReady,
    keepPreviousData: false,
  })
  const invTypeaheadNames = useMemo(() => {
    const query = debouncedFilter
    const seen = new Set<string>()
    const names: string[] = []
    for (const item of rankInventorySearch(invTypeaheadPage?.items ?? [], query)) {
      const label = catalogCardIdentity(item.card.name)
      const key = foldSearchText(label)
      if (seen.has(key)) continue
      seen.add(key)
      names.push(label)
      if (names.length >= 12) break
    }
    return names
  }, [invTypeaheadPage?.items, debouncedFilter])
  const showInvTypeahead = invTypeaheadOpen && invTypeaheadReady && invTypeaheadNames.length > 0

  const scopedToSet = Boolean(catalogSetFilter.trim())
  const scopedToFinish = catalogFinishFilter !== 'all'
  const typeaheadReady =
    debouncedCatalogSearch.length >= 2 &&
    Boolean(gameFilter) &&
    !nameHit &&
    !selectedCard

  const { data: typeaheadResults = [], isFetching: typeaheadFetching } = useQuery({
    queryKey: ['card-search', 'typeahead', 'prefix-rank', debouncedCatalogSearch, catalogFinishFilter, gameFilter],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: debouncedCatalogSearch,
          unique: 'cards',
          limit: 12,
          remote: 0,
          ...(gameFilter ? { game: gameFilter } : {}),
          ...(scopedToFinish ? { finish: catalogFinishFilter } : {}),
        },
      })
      return data
    },
    enabled: typeaheadReady,
    staleTime: 30_000,
  })

  const { data: catalogResults = [], refetch: runCatalogSearch, isFetching: catalogSearching } = useQuery({
    queryKey: ['card-search', 'unique-cards', catalogSearch, catalogSetFilter, catalogFinishFilter, gameFilter],
    queryFn: async () => {
      if (!catalogSearch.trim()) return []
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: catalogSearch,
          // Scoped to the game being managed, so a Pokémon search never
          // returns Magic printings (and never hits Scryfall for them).
          ...(gameFilter ? { game: gameFilter } : {}),
          // Name-only search stays unique so "sol" can list Sol Ring vs Solar
          // Blaze. A set (or set+finish) filter means we want those printings.
          ...(scopedToSet ? { set: catalogSetFilter.trim() } : { unique: 'cards' }),
          ...(scopedToFinish ? { finish: catalogFinishFilter } : {}),
        },
      })
      return data
    },
    enabled: false,
  })

  const printingsQuery = useCardPrintings(nameHit?.id, Boolean(nameHit))
  const printings = useMemo(() => {
    let items = printingsQuery.data ?? []
    const setNeedle = catalogSetFilter.trim().toLowerCase()
    if (setNeedle) {
      items = items.filter((card) => {
        const code = (card.setCode ?? '').toLowerCase()
        const setName = (card.setName ?? '').toLowerCase()
        return code === setNeedle || code.startsWith(setNeedle) || setName.includes(setNeedle)
      })
    }
    if (!scopedToFinish) return items
    return items.filter((card) => printingHasFinish(card, catalogFinishFilter))
  }, [printingsQuery.data, scopedToFinish, catalogFinishFilter, catalogSetFilter])

  useEffect(() => {
    if (!nameHit || selectedCard) return
    if (printingsQuery.isPending || printingsQuery.isFetching) return
    if (printingsQuery.isError) {
      selectCatalogCard(nameHit)
    }
  }, [nameHit, selectedCard, printingsQuery.isPending, printingsQuery.isFetching, printingsQuery.isError])

  const typeaheadNames = useMemo(() => {
    const query = debouncedCatalogSearch
    const seen = new Set<string>()
    return [...typeaheadResults]
      .filter((card) => {
        const key = foldSearchText(catalogCardIdentity(card.name))
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort(
        (left, right) =>
          typeaheadNameTier(catalogCardIdentity(left.name), query) -
          typeaheadNameTier(catalogCardIdentity(right.name), query),
      )
  }, [typeaheadResults, debouncedCatalogSearch])

  const showTypeahead = typeaheadOpen && typeaheadReady && typeaheadNames.length > 0

  useEffect(() => {
    setTypeaheadIndex(typeaheadNames.length > 0 ? 0 : -1)
  }, [debouncedCatalogSearch, typeaheadNames])

  useEffect(() => {
    setInvTypeaheadIndex(invTypeaheadNames.length > 0 ? 0 : -1)
  }, [debouncedFilter, invTypeaheadNames])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (typeaheadRef.current && !typeaheadRef.current.contains(event.target as Node)) {
        setTypeaheadOpen(false)
      }
      if (invTypeaheadRef.current && !invTypeaheadRef.current.contains(event.target as Node)) {
        setInvTypeaheadOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function autofillCatalogName(card: CardSummary) {
    setCatalogSearch(catalogCardIdentity(card.name))
    setTypeaheadOpen(false)
    setTypeaheadIndex(-1)
  }

  function autofillInventoryName(name: string) {
    setFilter(name)
    setInvTypeaheadOpen(false)
    setInvTypeaheadIndex(-1)
  }

  async function startCatalogSearch() {
    setNameHit(null)
    setSelectedCard(null)
    const typed = catalogSearch.trim()
    const canReuseTypeahead =
      !scopedToSet &&
      typeaheadResults.length > 0 &&
      foldSearchText(debouncedCatalogSearch) === foldSearchText(typed)
    const rows = canReuseTypeahead ? typeaheadResults : ((await runCatalogSearch()).data ?? [])
    if (rows.length === 0) return
    const exact = rows.find((card) => catalogNamesMatch(card.name, typed))
    if (exact) {
      setNameHit(exact)
      return
    }
    if (rows.length === 1) {
      setNameHit(rows[0])
    }
  }

  function selectCatalogCard(card: CardSummary) {
    setSelectedCard(card)
    const options = finishOptions(card)
    const foilOption = options.find((option) => option.isFoil)
    const plainOption = options.find((option) => !option.isFoil)
    const nextFinish =
      catalogFinishFilter === 'foil' && foilOption
        ? foilOption.value
        : catalogFinishFilter === 'nonfoil' && plainOption
          ? plainOption.value
          : defaultFinishFor(card)
    setFinish(nextFinish)
    applyScryfallPrice(card, nextFinish)
  }

  useEffect(() => {
    if (!selectedCard) return
    addEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedCard])

  function handleFinishChange(nextFinish: string) {
    setFinish(nextFinish)
    if (selectedCard) {
      applyScryfallPrice(selectedCard, nextFinish)
    }
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCard) return
      await api.post(`/stores/${slug}/inventory`, {
        cardId: selectedCard.id,
        quantity,
        priceCents: parsePriceInput(priceText) ?? 0,
        condition,
        finish,
        acquisitionCostCents: parsePriceInput(costText),
      })
    },
    onMutate: () => setMutationError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
      await queryClient.invalidateQueries({ queryKey: inventoryPageKey(slug) })
      setSelectedCard(null)
      setNameHit(null)
      setCatalogSearch('')
      setCostText('')
    },
    onError: (err) => setMutationError(extractErrorMessage(err, 'Could not add inventory item.')),
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: InventoryEditPayload) => {
      const { data } = await api.patch<InventoryItem>(`/stores/${slug}/inventory/${payload.itemId}`, {
        cardId: payload.cardId,
        quantity: payload.quantity,
        priceCents: parsePriceInput(payload.priceText) ?? 0,
        acquisitionCostCents: parsePriceInput(payload.costText),
        condition: payload.condition,
        finish: payload.finish,
      })
      return data
    },
    onMutate: () => setMutationError(null),
    onSuccess: (updated, payload) => {
      // Write the server's result straight into the cache so the list reflects
      // the edit immediately (don't rely solely on the refetch), then invalidate
      // to reconcile the merge/removal case.
      queryClient.setQueriesData<InventoryItem[]>({ queryKey: inventoryKey(slug) }, (old = []) =>
        (old ?? []).map((it) => (it.id === payload.itemId ? { ...it, ...updated } : it)),
      )
      void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
      void queryClient.invalidateQueries({ queryKey: inventoryPageKey(slug) })
      setEditingItem(null)
    },
    onError: (err) => setMutationError(extractErrorMessage(err, 'Could not save changes.')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/stores/${slug}/inventory/${id}`)
      return id
    },
    onMutate: () => setMutationError(null),
    onSuccess: (id) => {
      queryClient.setQueriesData<InventoryItem[]>({ queryKey: inventoryKey(slug) }, (old = []) =>
        (old ?? []).filter((it) => it.id !== id),
      )
      void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
      void queryClient.invalidateQueries({ queryKey: inventoryPageKey(slug) })
    },
    onError: (err) => setMutationError(extractErrorMessage(err, 'Could not remove inventory item.')),
  })

  // Games present in this store's inventory; pills only render for 2+.
  // Every platform game is offered as pure navigation — a store has to be
  // able to start stocking a game it does not carry yet. The numbers live in
  // the workspace header, where they can say what they count.
  const { data: games = [] } = useCatalogGames()
  const gameOptions = useMemo(
    () => games.map((game) => ({ code: game.code, name: game.name })),
    [games],
  )
  const { data: gameStats, isLoading: statsLoading } = useStoreGameStats(slug, gameFilter)
  const inventorySets = gameStats?.sets ?? []
  const { data: catalogGameSets = [] } = useGameSets(gameFilter)
  const catalogSetOptions = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string }>()
    for (const set of catalogGameSets) {
      const code = set.code?.trim()
      if (!code) continue
      byCode.set(code.toLowerCase(), { code, name: set.name })
    }
    for (const set of inventorySets) {
      const code = set.code?.trim()
      if (!code) continue
      const key = code.toLowerCase()
      if (!byCode.has(key)) byCode.set(key, { code, name: set.name })
    }
    return [...byCode.values()]
  }, [catalogGameSets, inventorySets])

  const activeGameName = gameOptions.find((game) => game.code === gameFilter)?.name ?? 'this game'
  // The finish filter is worded in the managed game's own terms, so a Pokemon
  // workspace offers "Holofoil only" rather than Magic's "Foil only".
  const gameFinishes = finishChoices(null, gameFilter)

  // Always manage exactly one game — a mixed table is how a One Piece card
  // hides among thousands of Magic rows.
  useEffect(() => {
    if (!gameFilter && gameOptions.length > 0) {
      setGameFilter(gameOptions[0].code)
    }
  }, [gameFilter, gameOptions])

  const inventoryFiltersActive =
    Boolean(filter.trim()) || Boolean(inventorySetFilter.trim()) || inventoryFinishFilter !== 'all'

  const clearInventoryFilters = () => {
    setFilter('')
    setInventorySetFilter('')
    setInventoryFinishFilter('all')
    setInvTypeaheadOpen(false)
  }

  useEffect(() => {
    setInvPage(1)
  }, [filter, inventorySetFilter, inventoryFinishFilter, gameFilter])
  const invPageCount = Math.max(1, Math.ceil(inventoryTotal / INVENTORY_PAGE_SIZE))
  const currentInvPage = Math.min(invPage, invPageCount)

  return (
    <div className="space-y-6">
      <GameWorkspaceHeader
        games={gameOptions}
        value={gameFilter}
        onChange={(code) => {
          setGameFilter(code)
          setNameHit(null)
          setSelectedCard(null)
        }}
        stats={gameStats}
        loading={statsLoading}
      />

      <Card>
        <CardHeader
          title="Add inventory"
          subtitle={`Searches the ${activeGameName} catalog. Every printing that exists, not just what you stock. Results are limited to ${activeGameName}.`}
        />
        <CardBody className="space-y-5">
          {mutationError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {mutationError}
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(14rem,20rem)_10rem_auto] lg:items-end">
            <Field label="Card name">
              {({ id }) => (
                <div ref={typeaheadRef} className="relative">
                  <div className="relative">
                    <Input
                      id={id}
                      value={catalogSearch}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showTypeahead}
                      aria-controls="catalog-typeahead"
                      aria-activedescendant={
                        showTypeahead && typeaheadIndex >= 0
                          ? `catalog-typeahead-${typeaheadNames[typeaheadIndex]?.id}`
                          : undefined
                      }
                      onFocus={() => {
                        if (typeaheadNames.length > 0) setTypeaheadOpen(true)
                      }}
                      onChange={(e) => {
                        const next = e.target.value
                        setCatalogSearch(next)
                        setTypeaheadOpen(true)
                        if (nameHit && foldSearchText(next) !== foldSearchText(nameHit.name)) {
                          setNameHit(null)
                          setSelectedCard(null)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && typeaheadNames.length > 0) {
                          e.preventDefault()
                          setTypeaheadOpen(true)
                          setTypeaheadIndex((index) => (index + 1) % typeaheadNames.length)
                          return
                        }
                        if (e.key === 'ArrowUp' && typeaheadNames.length > 0) {
                          e.preventDefault()
                          setTypeaheadOpen(true)
                          setTypeaheadIndex((index) => (index <= 0 ? typeaheadNames.length - 1 : index - 1))
                          return
                        }
                        if (e.key === 'Escape') {
                          setTypeaheadOpen(false)
                          return
                        }
                        if (e.key === 'Tab' && showTypeahead) {
                          const card = typeaheadNames[typeaheadIndex] ?? typeaheadNames[0]
                          if (card) autofillCatalogName(card)
                          return
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (showTypeahead) {
                            const card = typeaheadNames[typeaheadIndex] ?? typeaheadNames[0]
                            if (card && !catalogNamesMatch(card.name, catalogSearch)) {
                              autofillCatalogName(card)
                              return
                            }
                          }
                          void startCatalogSearch()
                        }
                      }}
                      placeholder="Start typing a card name…"
                      className={typeaheadFetching ? 'pr-9' : undefined}
                    />
                    {typeaheadFetching ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <Spinner size="sm" />
                      </span>
                    ) : null}
                  </div>
                  {showTypeahead ? (
                    <ul
                      id="catalog-typeahead"
                      role="listbox"
                      aria-label="Matching cards"
                      className={cx(dropdownPanelClass, 'absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto p-1')}
                    >
                      {typeaheadNames.map((card, index) => (
                        <li key={card.id} id={`catalog-typeahead-${card.id}`} role="option" aria-selected={index === typeaheadIndex}>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => autofillCatalogName(card)}
                            onMouseEnter={() => setTypeaheadIndex(index)}
                            className={dropdownItemClass({ active: index === typeaheadIndex })}
                          >
                            <span className="truncate">{catalogCardIdentity(card.name)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </Field>
            <Field label="Set">
              {({ id }) => (
                <SetCodeTypeahead
                  id={id}
                  value={catalogSetFilter}
                  onChange={setCatalogSetFilter}
                  sets={catalogSetOptions}
                  listboxId="catalog-set-typeahead"
                  ariaLabel="Matching catalog sets"
                  placeholder="Set code or name"
                  onEnter={() => void startCatalogSearch()}
                />
              )}
            </Field>
            <Field label="Finish">
              {({ id }) => (
                <Select
                  id={id}
                  value={catalogFinishFilter}
                  onChange={(e) => setCatalogFinishFilter(e.target.value as 'all' | 'foil' | 'nonfoil')}
                >
                  <option value="all">All finishes</option>
                  <option value="nonfoil">{gameFinishes.plain} only</option>
                  <option value="foil">{gameFinishes.foil} only</option>
                </Select>
              )}
            </Field>
            <Button onClick={() => void startCatalogSearch()} loading={catalogSearching}>
              <Search className="size-4" aria-hidden />
              Search
            </Button>
          </div>

          {catalogResults.length > 0 && !nameHit && !selectedCard && !typeaheadReady ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalogResults.map((card) => (
                <CatalogResultCard
                  key={card.id}
                  card={card}
                  selected={false}
                  onSelect={() => (scopedToSet ? selectCatalogCard(card) : setNameHit(card))}
                />
              ))}
            </div>
          ) : null}

          {nameHit && !selectedCard ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{catalogCardIdentity(nameHit.name)}</p>
                  <p className="text-xs text-fg-muted">
                    {printings.length > 0
                      ? `${printings.length} ${printings.length === 1 ? 'printing' : 'printings'} of ${catalogCardIdentity(nameHit.name)}`
                      : 'Pick a printing'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNameHit(null)}
                  className="text-sm font-semibold text-fg-muted hover:text-fg"
                >
                  Change
                </button>
              </div>
              {printingsQuery.isPending || printingsQuery.isFetching ? (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : printings.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No matching printings"
                  description={
                    scopedToFinish
                      ? 'No printing of this card is sold in that finish. Clear the finish filter to see every printing.'
                      : 'No paper printings were found for this card.'
                  }
                />
              ) : (
                <PrintingGrid
                  items={printings}
                  selectedId={null}
                  finish={catalogFinishFilter === 'foil' ? 'foil' : 'nonfoil'}
                  onSelect={selectCatalogCard}
                  showIndex={false}
                  size="lg"
                />
              )}
            </div>
          ) : null}

          {selectedCard && (
            <div ref={addEditorRef} className="scroll-mt-24">
              <SelectedCardEditor
              card={selectedCard}
              quantity={quantity}
              condition={condition}
              finish={finish}
              pending={addMutation.isPending}
              costText={costText}
              onCostChange={setCostText}
              priceText={priceText}
              onPriceChange={setPriceText}
              onQuantityChange={setQuantity}
              onConditionChange={setCondition}
              onFinishChange={handleFinishChange}
              onAdd={() => addMutation.mutate()}
              onBack={
                nameHit || catalogResults.length > 0
                  ? () => setSelectedCard(null)
                  : undefined
              }
              backLabel={nameHit ? 'Back to printings' : 'Back to results'}
            />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${activeGameName} inventory`}
          subtitle={
            listingsRefreshing
              ? 'Updating listings…'
              : inventoryTotal > 0
                ? `${inventoryTotal.toLocaleString()} listings in ${activeGameName}.`
                : `What this store stocks in ${activeGameName}. Price, quantity, and quick edits.`
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_minmax(14rem,20rem)_10rem_auto_auto] lg:items-end">
            <Field label="Search stock">
              {({ id }) => (
                <div ref={invTypeaheadRef} className="relative">
                  <div className="relative">
                    <Input
                      id={id}
                      value={filter}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showInvTypeahead}
                      aria-controls="inventory-typeahead"
                      aria-activedescendant={
                        showInvTypeahead && invTypeaheadIndex >= 0
                          ? `inventory-typeahead-${invTypeaheadIndex}`
                          : undefined
                      }
                      onFocus={() => {
                        if (invTypeaheadNames.length > 0) setInvTypeaheadOpen(true)
                      }}
                      onChange={(e) => {
                        setFilter(e.target.value)
                        setInvTypeaheadOpen(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && invTypeaheadNames.length > 0) {
                          e.preventDefault()
                          setInvTypeaheadOpen(true)
                          setInvTypeaheadIndex((index) => (index + 1) % invTypeaheadNames.length)
                          return
                        }
                        if (e.key === 'ArrowUp' && invTypeaheadNames.length > 0) {
                          e.preventDefault()
                          setInvTypeaheadOpen(true)
                          setInvTypeaheadIndex((index) =>
                            index <= 0 ? invTypeaheadNames.length - 1 : index - 1,
                          )
                          return
                        }
                        if (e.key === 'Escape') {
                          setInvTypeaheadOpen(false)
                          return
                        }
                        if (e.key === 'Tab' && showInvTypeahead) {
                          const name = invTypeaheadNames[invTypeaheadIndex] ?? invTypeaheadNames[0]
                          if (name) autofillInventoryName(name)
                          return
                        }
                        if (e.key === 'Enter' && showInvTypeahead) {
                          const name = invTypeaheadNames[invTypeaheadIndex] ?? invTypeaheadNames[0]
                          if (name && !catalogNamesMatch(name, filter)) {
                            e.preventDefault()
                            autofillInventoryName(name)
                          } else {
                            setInvTypeaheadOpen(false)
                          }
                        }
                      }}
                      placeholder={`Search ${activeGameName} stock by name…`}
                      className={cx('min-h-11 text-base', invTypeaheadFetching && 'pr-9')}
                    />
                    {invTypeaheadFetching ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <Spinner size="sm" />
                      </span>
                    ) : null}
                  </div>
                  {showInvTypeahead ? (
                    <ul
                      id="inventory-typeahead"
                      role="listbox"
                      aria-label="Matching inventory cards"
                      className={cx(dropdownPanelClass, 'absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto p-1')}
                    >
                      {invTypeaheadNames.map((name, index) => (
                        <li
                          key={name}
                          id={`inventory-typeahead-${index}`}
                          role="option"
                          aria-selected={index === invTypeaheadIndex}
                        >
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => autofillInventoryName(name)}
                            onMouseEnter={() => setInvTypeaheadIndex(index)}
                            className={dropdownItemClass({ active: index === invTypeaheadIndex })}
                          >
                            <span className="truncate">{name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </Field>
            <Field label="Set">
              {({ id }) => (
                <SetCodeTypeahead
                  id={id}
                  value={inventorySetFilter}
                  onChange={setInventorySetFilter}
                  sets={inventorySets}
                  listboxId="inventory-set-typeahead"
                  ariaLabel="Matching inventory sets"
                  placeholder="Set code or name"
                />
              )}
            </Field>
            <Field label="Finish">
              {({ id }) => (
                <Select
                  id={id}
                  value={inventoryFinishFilter}
                  onChange={(e) => setInventoryFinishFilter(e.target.value as 'all' | 'foil' | 'nonfoil')}
                  className="min-h-11"
                >
                  <option value="all">All finishes</option>
                  <option value="nonfoil">{gameFinishes.plain} only</option>
                  <option value="foil">{gameFinishes.foil} only</option>
                </Select>
              )}
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={!inventoryFiltersActive}
              onClick={clearInventoryFilters}
              className="min-h-11"
            >
              <X className="size-4" aria-hidden />
              Clear
            </Button>
            <div
              className="inline-flex h-11 overflow-hidden rounded-btn border border-border self-end"
              role="group"
              aria-label="Inventory layout"
            >
              <button
                type="button"
                onClick={() => chooseStockView('list')}
                aria-pressed={stockView === 'list'}
                aria-label="List view"
                title="List view"
                className={cx(
                  'grid size-11 place-items-center transition-colors',
                  stockView === 'list' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg',
                )}
              >
                <List aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => chooseStockView('cards')}
                aria-pressed={stockView === 'cards'}
                aria-label="Floating cards view"
                title="Floating cards"
                className={cx(
                  'grid size-11 place-items-center border-l border-border transition-colors',
                  stockView === 'cards' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg',
                )}
              >
                <LayoutGrid aria-hidden className="size-4" />
              </button>
            </div>
          </div>

          {listingsLoading ? (
            <InventoryAdminListSkeleton count={6} />
          ) : inventoryTotal === 0 ? (
            <EmptyState
              icon={Search}
              title={inventoryFiltersActive ? 'No matching inventory' : 'No inventory yet'}
              description={
                inventoryFiltersActive
                  ? 'No listings match your search or filters.'
                  : 'Add cards above or import a CSV to get started.'
              }
              action={
                inventoryFiltersActive ? (
                  <Button variant="secondary" size="sm" onClick={clearInventoryFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className={listingsRefreshing ? 'space-y-4 opacity-70' : 'space-y-4'}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stockView}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                >
                  {stockView === 'cards' ? (
                    <Stagger
                      immediate
                      gap={0.03}
                      className="grid grid-cols-2 justify-start gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(14.5rem,14.5rem))] sm:gap-x-4 sm:gap-y-5"
                    >
                      {inventory.map((item) => (
                        <StaggerItem key={item.id} y={12} className="min-w-0">
                          <InventoryFloatingCard
                            item={item}
                            onEdit={() => setEditingItem(item)}
                            onDelete={() => deleteMutation.mutate(item.id)}
                            deleting={deleteMutation.isPending}
                          />
                        </StaggerItem>
                      ))}
                    </Stagger>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                      {inventory.map((item) => (
                        <InventoryResultCard
                          key={item.id}
                          item={item}
                          onEdit={() => setEditingItem(item)}
                          onDelete={() => deleteMutation.mutate(item.id)}
                          deleting={deleteMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              <Pagination
                page={currentInvPage}
                pageCount={invPageCount}
                onPageChange={setInvPage}
                totalItems={inventoryTotal}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <EditInventoryModal
        slug={slug}
        item={editingItem}
        inventory={inventory}
        pending={updateMutation.isPending}
        onClose={() => setEditingItem(null)}
        onSave={(payload) => updateMutation.mutate(payload)}
      />
    </div>
  )
}
