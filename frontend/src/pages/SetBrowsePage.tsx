import { useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { Layers, Search, Sparkles } from 'lucide-react'
import type { InventoryItem } from '../api/types'
import { useBrowseQuery, useInventoryCatalog, useStore, useStoreTheme } from '../hooks'
import { BackButton, Badge, Button, EmptyState, Select } from '../components/ui'
import { BrowsePrintingTile } from '../components/cards'
import { BrowseSearchField } from '../components/store/BrowseSearchField'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { formatDate } from '../lib/format'
import { normalizeSetCode } from '../lib/setBrowse'
import { printingMatchesBrowseQuery } from '../lib/browseSearch'

type SortMode = 'collector' | 'name' | 'price-asc' | 'price-desc'

type SetNavState = {
  from?: string
  inventoryId?: string | number
  setCode?: string
  gameCode?: string
  seedItems?: InventoryItem[]
}

function collectorSortKey(collectorNumber?: string | null): number {
  if (!collectorNumber) return Number.MAX_SAFE_INTEGER
  const match = collectorNumber.match(/^(\d+)/)
  if (match) return parseInt(match[1], 10)
  return Number.MAX_SAFE_INTEGER
}

function groupByPrinting(items: InventoryItem[]) {
  const map = new Map<string, InventoryItem[]>()
  for (const item of items) {
    const key = item.card.id
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }

  return Array.from(map.values()).map((listings) => {
    const sorted = [...listings].sort((a, b) => a.priceCents - b.priceCents)
    return {
      representative: sorted[0],
      listingCount: listings.length,
      totalQty: listings.reduce((sum, row) => sum + row.quantity, 0),
      fromPriceCents: sorted[0].priceCents,
    }
  })
}

export default function SetBrowsePage() {
  const { slug = '', setCode: setCodeParam = '' } = useParams()
  const setCodeNorm = normalizeSetCode(decodeURIComponent(setCodeParam))
  const [searchParams] = useSearchParams()
  const nav = (useLocation().state as SetNavState | null) ?? {}
  const game = searchParams.get('game')?.trim() || nav.gameCode || undefined
  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const { data: inventory = [], isLoading } = useInventoryCatalog(slug, {
    set: setCodeNorm,
    inStockOnly: true,
    game,
    enabled: Boolean(setCodeNorm),
  })

  const { draft, setDraft, query } = useBrowseQuery()
  const [sort, setSort] = useState<SortMode>('collector')

  const inSet = useMemo(() => {
    const byId = new Map<number, InventoryItem>()
    for (const item of [...inventory, ...(nav.seedItems ?? [])]) {
      if (item.quantity > 0 && normalizeSetCode(item.card.setCode ?? '') === setCodeNorm) {
        byId.set(item.id, item)
      }
    }
    return [...byId.values()]
  }, [inventory, nav.seedItems, setCodeNorm])

  const setMeta = inSet[0]?.card
  const setName = setMeta?.setName ?? setCodeNorm.toUpperCase()
  const gameLabel =
    setMeta?.gameCode === 'mtg'
      ? 'Magic: The Gathering'
      : setMeta?.gameCode === 'pokemon'
        ? 'Pokémon'
        : setMeta?.gameCode === 'onepiece'
          ? 'One Piece'
          : setMeta?.gameCode === 'fab'
            ? 'Flesh and Blood'
            : setMeta?.gameCode === 'riftbound'
              ? 'Riftbound'
              : 'Singles'

  const groupedAll = useMemo(() => groupByPrinting(inSet), [inSet])

  const grouped = useMemo(() => {
    let rows = groupedAll
    if (query) {
      rows = rows.filter(({ representative }) => printingMatchesBrowseQuery(representative, query))
    }

    rows = [...rows].sort((a, b) => {
      const ca = a.representative.card
      const cb = b.representative.card
      switch (sort) {
        case 'name':
          return ca.name.localeCompare(cb.name)
        case 'price-asc':
          return a.fromPriceCents - b.fromPriceCents
        case 'price-desc':
          return b.fromPriceCents - a.fromPriceCents
        case 'collector':
        default: {
          const num = collectorSortKey(ca.collectorNumber) - collectorSortKey(cb.collectorNumber)
          if (num !== 0) return num
          return ca.name.localeCompare(cb.name)
        }
      }
    })
    return rows
  }, [groupedAll, query, sort])

  const uniqueCards = groupedAll.length
  const totalCopies = inSet.reduce((sum, item) => sum + item.quantity, 0)
  const releasedLabel = setMeta?.releasedAt ? formatDate(setMeta.releasedAt) : null

  return (
    <div className="storefront-atmosphere space-y-6 pb-12 sm:space-y-8">
      <div className="space-y-4">
        <BackButton to={`/s/${slug}`}>Back to store</BackButton>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card dark:glass-card">
          <div className="relative px-4 py-5 sm:px-10 sm:py-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/8 via-transparent to-accent-500/6"
            />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{setCodeNorm.toUpperCase()}</Badge>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted">{gameLabel}</span>
                </div>
                <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-4xl">{setName}</h1>
                <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
                  Every card {store?.name ?? 'this store'} has in stock from this set. Browse by collector number, compare
                  prices, and jump straight to a listing.
                </p>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-fg-muted">Unique cards</dt>
                    <dd className="font-bold text-fg">{uniqueCards}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">Copies in stock</dt>
                    <dd className="font-bold text-fg">{totalCopies}</dd>
                  </div>
                  {releasedLabel && (
                    <div>
                      <dt className="text-fg-muted">Released</dt>
                      <dd className="font-bold text-fg">{releasedLabel}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border/80 bg-bg/60 px-4 py-3 backdrop-blur-sm">
                <Layers aria-hidden className="size-8 text-brand-600" />
                <div className="text-sm">
                  <p className="font-bold text-fg">Set inventory</p>
                  <p className="text-fg-muted">
                    {inSet.length} active listing{inSet.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading && inSet.length === 0 ? (
        <StorePageLoader label="Loading set…" />
      ) : inSet.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No cards from this set in stock"
          description={`${store?.name ?? 'This store'} doesn't have any listings for ${setName} right now.`}
          action={
            <Link to={`/s/${slug}`} className="font-semibold text-brand-600 hover:underline">
              Browse all inventory
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <BrowseSearchField
              id="set-browse-search"
              label="Search this set"
              placeholder="Name, number, type, artist…"
              value={draft}
              onChange={setDraft}
              resultCount={grouped.length}
              totalCount={groupedAll.length}
            />
            <Select
              label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              wrapperClassName="w-full shrink-0 sm:w-52"
              className="w-full"
            >
              <option value="collector">Collector number</option>
              <option value="name">Name (A–Z)</option>
              <option value="price-asc">Price (low to high)</option>
              <option value="price-desc">Price (high to low)</option>
            </Select>
          </div>

          {grouped.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matches"
              description="Try a card name, collector number, type, or artist."
              action={
                <Button variant="secondary" onClick={() => setDraft('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {grouped.map((entry, index) => (
                <BrowsePrintingTile
                  key={entry.representative.card.id}
                  slug={slug}
                  entry={entry}
                  priority={index < 8}
                  toState={{
                    from: 'set',
                    setCode: entry.representative.card.setCode,
                    gameCode: entry.representative.card.gameCode,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
