import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage, formatPrice, parsePriceInput } from '../../api/client'
import type { SealedInventoryLine, SealedProduct } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  FilterPill,
  Input,
  LoadingPanel,
  Modal,
  Pagination,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'
import {
  sealedInventoryKey,
  sealedSpotlightKey,
  useCatalogGames,
  useDebouncedValue,
  useGameSets,
  useSealedCatalogSearch,
  useStoreSealedInventory,
} from '../../hooks'
import { Package } from 'lucide-react'

/**
 * Sealed tab: manage the store's sealed inventory (boxes, bundles, decks)
 * and add stock from the shared TCGCSV catalog, browsable per game and set.
 */
export default function SealedTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [gameFilter, setGameFilter] = useState('')
  const [setFilter, setSetFilter] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState<SealedProduct | null>(null)
  const [error, setError] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(search, 300)
  const { data: games = [] } = useCatalogGames()
  const { data: sets = [] } = useGameSets(gameFilter)
  const { data: inventory = [], isLoading: inventoryLoading } = useStoreSealedInventory(slug)
  const catalogQuery = useSealedCatalogSearch({
    game: gameFilter || undefined,
    setId: setFilter || undefined,
    q: debouncedSearch,
    page,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: sealedInventoryKey(slug) })
    void queryClient.invalidateQueries({ queryKey: sealedSpotlightKey(slug) })
  }

  const removeLine = useMutation({
    mutationFn: async (id: number) => api.delete(`/stores/${slug}/sealed-inventory/${id}`),
    onSuccess: invalidate,
    onError: (err) => setError(extractErrorMessage(err, 'Could not remove the sealed line.')),
  })

  const updateLine = useMutation({
    mutationFn: async (payload: { id: number; quantity?: number; priceCents?: number }) =>
      api.patch(`/stores/${slug}/sealed-inventory/${payload.id}`, payload),
    onSuccess: invalidate,
    onError: (err) => setError(extractErrorMessage(err, 'Could not update the sealed line.')),
  })

  const visibleInventory = useMemo(
    () => (gameFilter ? inventory.filter((line) => line.product?.gameCode === gameFilter) : inventory),
    [inventory, gameFilter],
  )

  const catalog = catalogQuery.data
  const pageCount = catalog ? Math.max(1, Math.ceil(catalog.total / catalog.perPage)) : 1
  const stockedProductIds = useMemo(
    () => new Set(inventory.map((line) => line.product?.id).filter(Boolean)),
    [inventory],
  )

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-btn border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Game separation: one pill per supported game. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={!gameFilter} onClick={() => { setGameFilter(''); setSetFilter(0); setPage(1) }}>
          All games
        </FilterPill>
        {games.map((game) => (
          <FilterPill
            key={game.code}
            active={gameFilter === game.code}
            onClick={() => { setGameFilter(game.code); setSetFilter(0); setPage(1) }}
          >
            {game.name}
          </FilterPill>
        ))}
      </div>

      {/* The store's sealed stock */}
      <Card>
        <CardHeader
          title="Sealed in stock"
          subtitle="Boxes, bundles, and decks this store carries. Prices default to the TCGplayer market snapshot."
        />
        <CardBody className="p-0">
          {inventoryLoading ? (
            <LoadingPanel label="Loading sealed inventory…" />
          ) : visibleInventory.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No sealed products yet"
              description="Search the catalog below and add boxes, bundles, or decks to your inventory."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Game / Set</TH>
                  <TH>Market</TH>
                  <TH>Price</TH>
                  <TH>Qty</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {visibleInventory.map((line) => (
                  <SealedLineRow
                    key={line.id}
                    line={line}
                    onUpdate={(patch) => updateLine.mutate({ id: line.id, ...patch })}
                    onRemove={() => removeLine.mutate(line.id)}
                  />
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Catalog browser */}
      <Card>
        <CardHeader
          title="Sealed catalog"
          subtitle="Browse the shared multi-game catalog and add products to your inventory."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="Search sealed products…"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            />
            <Select
              value={String(setFilter)}
              disabled={!gameFilter}
              onChange={(event) => { setSetFilter(Number(event.target.value)); setPage(1) }}
            >
              <option value="0">{gameFilter ? 'All sets' : 'Pick a game to filter by set'}</option>
              {sets.map((set) => (
                <option key={set.id} value={String(set.id)}>
                  {set.name}
                </option>
              ))}
            </Select>
          </div>

          {catalogQuery.isLoading ? (
            <LoadingPanel label="Searching the catalog…" />
          ) : !catalog || catalog.items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No sealed products found"
              description="The catalog fills up when a platform admin runs a TCGCSV sync for a game."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {catalog.items.map((product) => (
                  <div key={product.id} className="flex flex-col rounded-card border border-border bg-surface p-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        className="mx-auto mb-2 h-32 w-auto rounded object-contain"
                      />
                    ) : (
                      <div className="mb-2 grid h-32 place-items-center rounded bg-bg text-fg-muted">
                        <Package className="size-8" />
                      </div>
                    )}
                    <p className="line-clamp-2 text-sm font-semibold text-fg" title={product.name}>{product.name}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {product.gameName ?? product.gameCode} {product.setName ? `· ${product.setName}` : ''}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-sm font-bold text-fg">
                        {product.marketPriceCents != null ? formatPrice(product.marketPriceCents) : '—'}
                      </span>
                      <Button size="sm" onClick={() => setAdding(product)}>
                        {stockedProductIds.has(product.id) ? 'Add stock' : 'Add'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={page} pageCount={pageCount} totalItems={catalog.total} onPageChange={setPage} />
            </>
          )}
        </CardBody>
      </Card>

      {adding && (
        <AddSealedModal
          slug={slug}
          product={adding}
          onClose={() => setAdding(null)}
          onAdded={() => { setAdding(null); invalidate() }}
        />
      )}
    </div>
  )
}

function SealedLineRow({
  line,
  onUpdate,
  onRemove,
}: {
  line: SealedInventoryLine
  onUpdate: (patch: { quantity?: number; priceCents?: number }) => void
  onRemove: () => void
}) {
  const product = line.product

  return (
    <TR>
      <TD>
        <div className="flex items-center gap-3">
          {product?.imageUrl && (
            <img src={product.imageUrl} alt="" loading="lazy" className="h-10 w-10 rounded object-contain" />
          )}
          <div>
            <p className="font-medium text-fg">{product?.name ?? 'Unknown product'}</p>
            {line.quantity === 0 && <Badge tone="warning">Sold out</Badge>}
          </div>
        </div>
      </TD>
      <TD className="text-sm text-fg-muted">
        {product?.gameName ?? product?.gameCode ?? '—'}
        {product?.setName ? ` · ${product.setName}` : ''}
      </TD>
      <TD className="text-sm text-fg-muted">
        {product?.marketPriceCents != null ? formatPrice(product.marketPriceCents) : '—'}
      </TD>
      <TD>
        <Input
          className="w-24"
          defaultValue={(line.priceCents / 100).toFixed(2)}
          onBlur={(event) => {
            const cents = parsePriceInput(event.target.value)
            if (cents != null && cents !== line.priceCents) onUpdate({ priceCents: cents })
          }}
          aria-label="Price"
        />
      </TD>
      <TD>
        <Input
          type="number"
          min={0}
          className="w-20"
          defaultValue={line.quantity}
          onBlur={(event) => {
            const quantity = Math.max(0, Number(event.target.value) || 0)
            if (quantity !== line.quantity) onUpdate({ quantity })
          }}
          aria-label="Quantity"
        />
      </TD>
      <TD className="text-right">
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </TD>
    </TR>
  )
}

function AddSealedModal({
  slug,
  product,
  onClose,
  onAdded,
}: {
  slug: string
  product: SealedProduct
  onClose: () => void
  onAdded: () => void
}) {
  const [quantity, setQuantity] = useState(1)
  const [priceText, setPriceText] = useState(
    product.marketPriceCents != null ? (product.marketPriceCents / 100).toFixed(2) : '',
  )
  const [costText, setCostText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addMutation = useMutation({
    mutationFn: async () =>
      api.post(`/stores/${slug}/sealed-inventory`, {
        sealedProductId: product.id,
        quantity,
        priceCents: parsePriceInput(priceText),
        acquisitionCostCents: parsePriceInput(costText),
      }),
    onSuccess: onAdded,
    onError: (err) => setError(extractErrorMessage(err, 'Could not add the sealed product.')),
  })

  return (
    <Modal open onClose={onClose} title={`Add ${product.name}`}>
      <div className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          </Field>
          <Field label="Sell price ($)">
            <Input value={priceText} onChange={(event) => setPriceText(event.target.value)} placeholder="Market price" />
          </Field>
        </div>
        <Field label="Cost per unit ($, optional)" hint="What you paid — powers margin reporting.">
          <Input value={costText} onChange={(event) => setCostText(event.target.value)} placeholder="0.00" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Adding…' : 'Add to inventory'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
