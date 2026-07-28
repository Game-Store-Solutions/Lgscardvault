import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import api, { extractErrorMessage, parsePriceInput, scryfallPriceCents } from '../../api/client'
import type { CardSummary, InventoryItem } from '../../api/types'
import { inventoryKey, useCatalogGames, useInventory } from '../../hooks'
import {
  Card,
  CardHeader,
  CardBody,
  FilterPill,
  Input,
  Select,
  Field,
  Button,
  EmptyState,
  Pagination,
} from '../../components/ui'
import { type Condition } from '../../components/inventory'
import {
  CatalogResultCard,
  EditInventoryModal,
  InventoryResultCard,
  SelectedCardEditor,
  type InventoryEditPayload,
} from './search'

/** Inventory cards shown per page in the admin grid. */
const INVENTORY_PAGE_SIZE = 24

export default function SearchTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState('')
  const [gameFilter, setGameFilter] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogSetFilter, setCatalogSetFilter] = useState('')
  const [catalogFinishFilter, setCatalogFinishFilter] = useState<'all' | 'foil' | 'nonfoil'>('all')
  const [selectedCard, setSelectedCard] = useState<CardSummary | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [condition, setCondition] = useState<Condition>('NM')
  const [isFoil, setIsFoil] = useState(false)
  const [costText, setCostText] = useState('')
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  function applyScryfallPrice(card: CardSummary, foil: boolean) {
    setPriceCents(scryfallPriceCents(card, foil ? 'foil' : 'nonfoil'))
  }

  const { data: inventory = [] } = useInventory(slug)

  const { data: catalogResults = [], refetch: runCatalogSearch } = useQuery({
    queryKey: ['card-search', catalogSearch, catalogSetFilter, catalogFinishFilter],
    queryFn: async () => {
      if (!catalogSearch.trim()) return []
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: catalogSearch,
          ...(catalogSetFilter.trim() ? { set: catalogSetFilter.trim() } : {}),
          ...(catalogFinishFilter !== 'all' ? { finish: catalogFinishFilter } : {}),
        },
      })
      return data
    },
    enabled: false,
  })

  function selectCatalogCard(card: CardSummary) {
    setSelectedCard(card)
    let nextIsFoil = isFoil
    if (catalogFinishFilter === 'foil') {
      nextIsFoil = true
    } else if (catalogFinishFilter === 'nonfoil') {
      nextIsFoil = false
    } else if (card.finishes?.includes('foil') && !card.finishes.includes('nonfoil')) {
      nextIsFoil = true
    } else if (card.finishes?.includes('nonfoil') && !card.finishes.includes('foil')) {
      nextIsFoil = false
    }
    setIsFoil(nextIsFoil)
    applyScryfallPrice(card, nextIsFoil)
  }

  function handleFinishChange(value: 'nonfoil' | 'foil') {
    const nextIsFoil = value === 'foil'
    setIsFoil(nextIsFoil)
    if (selectedCard) {
      applyScryfallPrice(selectedCard, nextIsFoil)
    }
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCard) return
      await api.post(`/stores/${slug}/inventory`, {
        cardId: selectedCard.id,
        quantity,
        priceCents: priceCents ?? 0,
        condition,
        isFoil,
        acquisitionCostCents: parsePriceInput(costText),
      })
    },
    onMutate: () => setMutationError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
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
        isFoil: payload.isFoil,
      })
      return data
    },
    onMutate: () => setMutationError(null),
    onSuccess: (updated, payload) => {
      // Write the server's result straight into the cache so the list reflects
      // the edit immediately (don't rely solely on the refetch), then invalidate
      // to reconcile the merge/removal case.
      queryClient.setQueryData<InventoryItem[]>(inventoryKey(slug), (old = []) =>
        old.map((it) => (it.id === payload.itemId ? { ...it, ...updated } : it)),
      )
      void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
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
      queryClient.setQueryData<InventoryItem[]>(inventoryKey(slug), (old = []) =>
        old.filter((it) => it.id !== id),
      )
      void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
    },
    onError: (err) => setMutationError(extractErrorMessage(err, 'Could not remove inventory item.')),
  })

  // Games present in this store's inventory; pills only render for 2+.
  const { data: games = [] } = useCatalogGames()
  const inventoryGameCodes = useMemo(
    () => new Set(inventory.map((item) => item.card.gameCode ?? 'mtg')),
    [inventory],
  )

  const filteredInventory = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return inventory.filter((item) => {
      const card = item.card
      if (gameFilter && (card.gameCode ?? 'mtg') !== gameFilter) return false
      if (!term) return true
      return (
        card.name.toLowerCase().includes(term) ||
        (card.setCode ?? '').toLowerCase().includes(term) ||
        (card.setName ?? '').toLowerCase().includes(term) ||
        (card.typeLine ?? '').toLowerCase().includes(term)
      )
    })
  }, [inventory, filter, gameFilter])

  // Paginate the inventory grid; reset to page 1 when the search filter changes.
  const [invPage, setInvPage] = useState(1)
  useEffect(() => {
    setInvPage(1)
  }, [filter, gameFilter])
  const invPageCount = Math.max(1, Math.ceil(filteredInventory.length / INVENTORY_PAGE_SIZE))
  const currentInvPage = Math.min(invPage, invPageCount)
  const visibleInventory = filteredInventory.slice(
    (currentInvPage - 1) * INVENTORY_PAGE_SIZE,
    currentInvPage * INVENTORY_PAGE_SIZE,
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Add inventory" subtitle="Search the catalog, then add a printing to this store." />
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
                  <option value="nonfoil">Nonfoil only</option>
                  <option value="foil">Foil only</option>
                </Select>
              )}
            </Field>
            <Button onClick={() => void runCatalogSearch()}>
              <Search className="size-4" aria-hidden />
              Search
            </Button>
          </div>

          {catalogResults.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalogResults.map((card) => (
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
            <SelectedCardEditor
              card={selectedCard}
              quantity={quantity}
              condition={condition}
              isFoil={isFoil}
              pending={addMutation.isPending}
              costText={costText}
              onCostChange={setCostText}
              onQuantityChange={setQuantity}
              onConditionChange={setCondition}
              onFinishChange={handleFinishChange}
              onAdd={() => addMutation.mutate()}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Store inventory"
          subtitle="Each item includes art, price, quantity, and quick edit actions."
          actions={
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search this store's inventory…"
              className="min-w-64"
            />
          }
        />
        <CardBody>
          {inventoryGameCodes.size > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <FilterPill active={!gameFilter} onClick={() => setGameFilter('')}>
                All games
              </FilterPill>
              {games
                .filter((game) => inventoryGameCodes.has(game.code))
                .map((game) => (
                  <FilterPill
                    key={game.code}
                    active={gameFilter === game.code}
                    onClick={() => setGameFilter(game.code)}
                  >
                    {game.name}
                  </FilterPill>
                ))}
            </div>
          )}
          {filteredInventory.length === 0 ? (
            <EmptyState
              icon={Search}
              title={filter.trim() ? 'No matching inventory' : 'No inventory yet'}
              description={
                filter.trim()
                  ? 'No inventory matches your search.'
                  : 'Add cards above or import a CSV to get started.'
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {visibleInventory.map((item) => (
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
                totalItems={filteredInventory.length}
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
