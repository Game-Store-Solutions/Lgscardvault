import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import api, { extractErrorMessage, parsePriceInput, scryfallPriceCents } from '../../api/client'
import type { CardSummary, InventoryItem } from '../../api/types'
import { inventoryKey, inventoryPageKey, useCatalogGames, useDebouncedValue, useInventoryPage, useStoreGameStats } from '../../hooks'
import { GameWorkspaceHeader } from '../../components/catalog'
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
} from '../../components/ui'
import { type Condition } from '../../components/inventory'
import { defaultFinishFor, finishChoices, isFoilFinish } from '../../lib/finishes'
import {
  CatalogResultCard,
  EditInventoryModal,
  InventoryResultCard,
  SelectedCardEditor,
  type InventoryEditPayload,
} from './search'

/** Inventory cards shown per page in the admin grid. */
const INVENTORY_PAGE_SIZE = 24

const TRAINING_LIGHTNING_BOLT: CardSummary = {
  id: 'training-lightning-bolt',
  name: 'Lightning Bolt',
  gameCode: 'mtg',
  setCode: 'LEA',
  setName: 'Limited Edition Alpha',
  collectorNumber: '161',
  rarity: 'common',
  prices: { usd: '1.50' },
  finishes: ['nonfoil'],
}

export default function SearchTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const trainingMode = useMemo(
    () => new URLSearchParams(window.location.search).get('training') === '1',
    [],
  )

  const [filter, setFilter] = useState('')
  const [inventorySetFilter, setInventorySetFilter] = useState('')
  const [inventoryFinishFilter, setInventoryFinishFilter] = useState<'all' | 'foil' | 'nonfoil'>('all')
  const [gameFilter, setGameFilter] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogSetFilter, setCatalogSetFilter] = useState('')
  const [catalogFinishFilter, setCatalogFinishFilter] = useState<'all' | 'foil' | 'nonfoil'>('all')
  const [selectedCard, setSelectedCard] = useState<CardSummary | null>(null)
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
    const market = scryfallPriceCents(card, isFoilFinish(nextFinish) ? 'foil' : 'nonfoil')
    setPriceText(market == null ? '' : (market / 100).toFixed(2))
  }

  const [invPage, setInvPage] = useState(1)
  const debouncedFilter = useDebouncedValue(filter, 300)

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

  const { data: catalogResults = [], refetch: runCatalogSearch } = useQuery({
    queryKey: ['card-search', catalogSearch, catalogSetFilter, catalogFinishFilter, gameFilter],
    queryFn: async () => {
      let query = catalogSearch.trim()
      if (!query && trainingMode) {
        const field = document.querySelector('[data-guide="Card name"]')
        if (field instanceof HTMLInputElement) query = field.value.trim()
      }
      if (!query) return []
      if (trainingMode && query.toLowerCase().includes('lightning')) {
        return [TRAINING_LIGHTNING_BOLT]
      }
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: query,
          // Scoped to the game being managed, so a Pokémon search never
          // returns Magic printings (and never hits Scryfall for them).
          ...(gameFilter ? { game: gameFilter } : {}),
          ...(catalogSetFilter.trim() ? { set: catalogSetFilter.trim() } : {}),
          ...(catalogFinishFilter !== 'all' ? { finish: catalogFinishFilter } : {}),
        },
      })
      const rows = data ?? []
      return rows
    },
    enabled: false,
  })

  const effectiveCatalogResults = useMemo(() => {
    if (!trainingMode) return catalogResults
    let query = catalogSearch.trim()
    if (!query) {
      const field = document.querySelector('[data-guide="Card name"]')
      if (field instanceof HTMLInputElement) query = field.value.trim()
    }
    if (query.toLowerCase().includes('lightning')) {
      return catalogResults.length > 0 ? catalogResults : [TRAINING_LIGHTNING_BOLT]
    }
    return catalogResults
  }, [trainingMode, catalogSearch, catalogResults])

  function selectCatalogCard(card: CardSummary) {
    setSelectedCard(card)
    // Start on the treatment the search was filtered to, else the first one
    // this printing is actually sold in — which outside Magic is "Normal",
    // not "Nonfoil".
    const published = finishChoices(card)
    const nextFinish =
      catalogFinishFilter === 'foil'
        ? published.foil
        : catalogFinishFilter === 'nonfoil'
          ? published.plain
          : defaultFinishFor(card)
    setFinish(nextFinish)
    applyScryfallPrice(card, nextFinish)
  }

  useEffect(() => {
    if (!trainingMode) return
    const onSearch = () => {
      const field = document.querySelector('[data-guide="Card name"]')
      const query =
        field instanceof HTMLInputElement && field.value.trim()
          ? field.value.trim()
          : catalogSearch.trim()
      if (query && query !== catalogSearch) setCatalogSearch(query)
      if (trainingMode && query.toLowerCase().includes('lightning')) {
        queryClient.setQueryData(
          ['card-search', query, catalogSetFilter, catalogFinishFilter, gameFilter],
          [TRAINING_LIGHTNING_BOLT],
        )
      }
      void runCatalogSearch()
    }
    const onSelect = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name ?? 'Lightning Bolt'
      selectCatalogCard(name === 'Lightning Bolt' ? TRAINING_LIGHTNING_BOLT : (catalogResults.find((row) => row.name === name) ?? TRAINING_LIGHTNING_BOLT))
    }
    const syncCardName = (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      setCatalogSearch(trimmed)
      if (trainingMode && trimmed.toLowerCase().includes('lightning')) {
        queryClient.setQueryData(
          ['card-search', trimmed, catalogSetFilter, catalogFinishFilter, gameFilter],
          [TRAINING_LIGHTNING_BOLT],
        )
      }
    }
    const onFillCardName = (event: Event) => {
      syncCardName((event as CustomEvent<{ value?: string }>).detail?.value ?? '')
    }
    const onFillGuide = (event: Event) => {
      const detail = (event as CustomEvent<{ guide?: string; value?: string }>).detail
      if (detail?.guide === 'Card name') syncCardName(detail.value ?? '')
    }
    document.addEventListener('training:fill-card-name', onFillCardName as EventListener)
    document.addEventListener('training:fill-guide', onFillGuide as EventListener)
    document.addEventListener('training:search-catalog', onSearch)
    document.addEventListener('training:select-catalog-card', onSelect as EventListener)
    return () => {
      document.removeEventListener('training:fill-card-name', onFillCardName as EventListener)
      document.removeEventListener('training:fill-guide', onFillGuide as EventListener)
      document.removeEventListener('training:search-catalog', onSearch)
      document.removeEventListener('training:select-catalog-card', onSelect as EventListener)
    }
  }, [trainingMode, runCatalogSearch, catalogResults, catalogSearch, catalogSetFilter, catalogFinishFilter, gameFilter, queryClient])

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
        onChange={setGameFilter}
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
                <Input
                  id={id}
                  data-guide="Card name"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runCatalogSearch()}
                  placeholder="Search card name…"
                />
              )}
            </Field>
            <Field label="Set">
              {({ id }) => (
                <Input
                  id={id}
                  data-guide="Set"
                  value={catalogSetFilter}
                  onChange={(e) => setCatalogSetFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runCatalogSearch()}
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
            <Button data-guide="Search catalog" onClick={() => void runCatalogSearch()}>
              <Search className="size-4" aria-hidden />
              Search
            </Button>
          </div>

          {effectiveCatalogResults.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {effectiveCatalogResults.map((card) => (
                <CatalogResultCard
                  key={card.id}
                  card={card}
                  selected={selectedCard?.id === card.id}
                  onSelect={() => selectCatalogCard(card)}
                />
              ))}
            </div>
          )}

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
                  data-guide="Search stock"
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
