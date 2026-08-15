import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Layers, Search, Sparkles } from 'lucide-react'
import { cardImage, formatPrice } from '../api/client'
import type { InventoryItem } from '../api/types'
import { useInventory, useStore, useStoreTheme } from '../hooks'
import { BackButton, Badge, EmptyState, Input, Select } from '../components/ui'
import { CardImage } from '../components/cards'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { finishName } from '../lib/finishes'
import { rarityAccent, rarityLabel } from '../lib/mtg'
import { formatDate } from '../lib/format'
import { cx } from '../lib/cx'
import { normalizeSetCode } from '../lib/setBrowse'

type SortMode = 'collector' | 'name' | 'price-asc' | 'price-desc'

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
    const representative = sorted[0]
    return {
      representative,
      listingCount: listings.length,
      totalQty: listings.reduce((sum, row) => sum + row.quantity, 0),
      fromPriceCents: sorted[0].priceCents,
    }
  })
}

export default function SetBrowsePage() {
  const { slug = '', setCode: setCodeParam = '' } = useParams()
  const setCodeNorm = normalizeSetCode(decodeURIComponent(setCodeParam))
  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const { data: inventory = [], isLoading } = useInventory(slug, { inStockOnly: true })

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('collector')

  const inSet = useMemo(
    () =>
      inventory.filter(
        (item) => item.quantity > 0 && normalizeSetCode(item.card.setCode ?? '') === setCodeNorm,
      ),
    [inventory, setCodeNorm],
  )

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

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    let rows = groupByPrinting(inSet)
    if (term) {
      rows = rows.filter(({ representative }) => {
        const card = representative.card
        return (
          card.name.toLowerCase().includes(term) ||
          (card.collectorNumber ?? '').toLowerCase().includes(term) ||
          (card.typeLine ?? '').toLowerCase().includes(term)
        )
      })
    }

    rows.sort((a, b) => {
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
  }, [inSet, search, sort])

  const uniqueCards = grouped.length
  const totalCopies = inSet.reduce((sum, item) => sum + item.quantity, 0)
  const releasedLabel = setMeta?.releasedAt ? formatDate(setMeta.releasedAt) : null

  return (
    <div className="storefront-atmosphere space-y-8 pb-12">
      <div className="space-y-4">
        <BackButton to={`/s/${slug}`} tone="soft">
          {store?.name ?? 'Store'}
        </BackButton>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card dark:glass-card">
          <div className="relative px-6 py-8 sm:px-10 sm:py-10">
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
                <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{setName}</h1>
                <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
                  Every card {store?.name ?? 'this store'} has in stock from this set — browse by collector number, compare
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
                  <p className="text-fg-muted">{inSet.length} active listing{inSet.length === 1 ? '' : 's'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Input
              id="set-browse-search"
              label="Search this set"
              placeholder="Search by name, number, or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-md"
            />
            <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="sm:w-48">
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
              description="Try a different search term or clear the filter."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {grouped.map((entry) => (
                <SetCardTile key={entry.representative.card.id} slug={slug} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SetCardTile({
  slug,
  entry,
}: {
  slug: string
  entry: {
    representative: InventoryItem
    listingCount: number
    totalQty: number
    fromPriceCents: number
  }
}) {
  const { representative, listingCount, totalQty, fromPriceCents } = entry
  const card = representative.card
  const image = cardImage(card)
  const accent = rarityAccent(card.rarity)
  const multiListing = listingCount > 1

  return (
    <Link
      to={`/s/${slug}/cards/${representative.id}`}
      state={{ from: 'set', setCode: card.setCode }}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card',
        'transition-transform duration-150 hover:-translate-y-0.5 hover:border-brand-500/35 dark:glass-card ui-lift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      )}
    >
      {multiListing && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-brand-600 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-white shadow">
          {listingCount} listings
        </span>
      )}
      <div className="relative aspect-[5/7] overflow-hidden bg-surface-elevated dark:bg-[#18181B]">
        <CardImage src={image} alt={card.name} fit="contain" className="size-full" />
        {card.rarity && (
          <span
            className="absolute left-2 top-2 z-10 size-2.5 rounded-full ring-2 ring-white/80"
            style={{ backgroundColor: accent }}
            title={rarityLabel(card.rarity)}
          />
        )}
        {card.collectorNumber && (
          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            #{card.collectorNumber}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h2 className="line-clamp-2 min-h-[2.5rem] font-display text-sm font-bold leading-snug text-fg group-hover:text-brand-600">
          {card.name}
        </h2>
        <p className="mt-1 truncate text-xs text-fg-muted">
          {card.rarity ? `${rarityLabel(card.rarity)} · ` : ''}
          {finishName(card, representative.isFoil, representative.finish)}
          {representative.condition ? ` · ${representative.condition}` : ''}
        </p>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
          <span className="text-lg font-bold tabular-nums text-fg">
            {multiListing ? `From ${formatPrice(fromPriceCents)}` : formatPrice(fromPriceCents)}
          </span>
          <span className="text-xs font-medium text-fg-muted">{totalQty} in stock</span>
        </div>
      </div>
    </Link>
  )
}
