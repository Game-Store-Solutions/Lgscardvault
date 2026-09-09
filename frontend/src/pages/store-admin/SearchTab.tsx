import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import api, { extractErrorMessage, parsePriceInput } from '../../api/client'
import type { CardSummary, InventoryItem } from '../../api/types'
import { inventoryKey, inventoryPageKey, useCardPrintings, useCatalogGames, useDebouncedValue, useInventoryPage, useStoreGameStats } from '../../hooks'
import { GameWorkspaceHeader, PrintingGrid } from '../../components/catalog'
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
import { foldSearchText, catalogNamesMatch, typeaheadNameTier } from '../../lib/searchText'
import {
  CatalogResultCard,
  EditInventoryModal,
  InventoryResultCard,
  SelectedCardEditor,
  type InventoryEditPayload,
} from './search'

/** Inventory cards shown per page in the admin grid. */
const INVENTORY_PAGE_SIZE = 24

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
  const [typeaheadIndex, setTypeaheadIndex] = useState(0)
  const [typeaheadOpen, setTypeaheadOpen] = useState(false)
  const typeaheadRef = useRef<HTMLDivElement>(null)
  const debouncedFilter = useDebouncedValue(filter, 300)
  const debouncedCatalogSearch = useDebouncedValue(catalogSearch.trim(), 300)

  const inventoryQuery = useInventoryPage(slug, {
    game: gameFilter || undefined,
    q: debouncedFilter,
    set: inventorySetFilter,
    finish: inventoryFinishFilter,
    page: invPage,
    itemsPerPage: INVENTORY_PAGE_SIZE,
    enabled: Boolean(gameFilter),
  })
  const inventory = inventoryQuery.data?.items ?? []
  const inventoryTotal = inventoryQuery.data?.total ?? 0
  const listingsLoading = inventoryQuery.isPending && !inventoryQuery.data
  const listingsRefreshing = inventoryQuery.isFetching && inventoryQuery.isPlaceholderData

  const scopedToSet = Boolean(catalogSetFilter.trim())
  const scopedToFinish = catalogFinishFilter !== 'all'
  const typeaheadReady =
    debouncedCatalogSearch.length >= 2 &&
    Boolean(gameFilter) &&
    !nameHit &&
    !selectedCard &&
    !scopedToSet

  const { data: typeaheadResults = [], isFetching: typeaheadFetching } = useQuery({
    queryKey: ['card-search', 'typeahead', 'prefix-rank', debouncedCatalogSearch, catalogFinishFilter, gameFilter],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: debouncedCatalogSearch,
          unique: 'cards',
          ...(gameFilter ? { game: gameFilter } : {}),
          ...(scopedToFinish ? { finish: catalogFinishFilter } : {}),
        },
      })
      return data.slice(0, 12)
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
    const items = printingsQuery.data ?? []
    if (!scopedToFinish) return items
    return items.filter((card) => printingHasFinish(card, catalogFinishFilter))
  }, [printingsQuery.data, scopedToFinish, catalogFinishFilter])

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
        const key = foldSearchText(card.name)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((left, right) => typeaheadNameTier(left.name, query) - typeaheadNameTier(right.name, query))
  }, [typeaheadResults, debouncedCatalogSearch])

  const showTypeahead = typeaheadOpen && typeaheadReady && typeaheadNames.length > 0

  useEffect(() => {
    setTypeaheadIndex(typeaheadNames.length > 0 ? 0 : -1)
  }, [debouncedCatalogSearch, typeaheadNames])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (typeaheadRef.current && !typeaheadRef.current.contains(event.target as Node)) {
        setTypeaheadOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function autofillCatalogName(card: CardSummary) {
    setCatalogSearch(card.name)
    setTypeaheadOpen(false)
    setTypeaheadIndex(-1)
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
    // A set filter already lists those printings. Name-only (or finish-only)
    // should open every printing of an exact match instead of one unique hit.
    if (scopedToSet || rows.length === 0) return
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
          title={`Add ${activeGameName} inventory`}
          subtitle={`Searches the ${activeGameName} catalog. Every printing that exists, not just what you stock. Results are limited to ${activeGameName}.`}
        />
        <CardBody className="space-y-5">
          {mutationError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {mutationError}
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_8rem_10rem_auto] lg:items-end">
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
                            <span className="truncate">{card.name}</span>
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
                <Input
                  id={id}
                  value={catalogSetFilter}
                  onChange={(e) => setCatalogSetFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void startCatalogSearch()}
                  placeholder="Set code"
                  className="uppercase"
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
                  <p className="truncate font-semibold text-fg">{nameHit.name}</p>
                  <p className="text-xs text-fg-muted">
                    {printings.length > 0
                      ? `${printings.length} ${printings.length === 1 ? 'printing' : 'printings'} of ${nameHit.name}`
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
                : `What this store stocks in ${activeGameName}. Art, price, quantity, and quick edits.`
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_8rem_10rem_auto] lg:items-end">
            <Field label="Search stock">
              {({ id }) => (
                <Input
                  id={id}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={`Search ${activeGameName} by name, type…`}
                  className="min-h-11 text-base"
                />
              )}
            </Field>
            <Field label="Set">
              {({ id }) => (
                <Input
                  id={id}
                  value={inventorySetFilter}
                  onChange={(e) => setInventorySetFilter(e.target.value)}
                  placeholder="Set code"
                  className="uppercase min-h-11"
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
