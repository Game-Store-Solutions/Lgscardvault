import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Palette, Search } from 'lucide-react'
import { cardImage, formatPrice } from '../api/client'
import type { InventoryItem } from '../api/types'
import { useInventory, useStore, useStoreTheme } from '../hooks'
import { BackButton, Button, EmptyState, Input, Modal } from '../components/ui'
import { Stagger, StaggerItem } from '../components/motion'
import { CardImage } from '../components/cards'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { inventoryByArtist } from '../lib/artistBrowse'
import { rarityAccent, rarityLabel } from '../lib/mtg'
import { cx } from '../lib/cx'
import { finishName } from '../lib/finishes'

type ArtistNavState = {
  from?: string
  inventoryId?: string | number
  artist?: string
  gameCode?: string
  seedItems?: InventoryItem[]
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

export default function ArtistBrowsePage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const artist = searchParams.get('name')?.trim() ?? ''
  const location = useLocation()
  const nav = (location.state as ArtistNavState | null) ?? {}
  const backTo =
    nav.from === 'card' && nav.inventoryId ? `/s/${slug}/cards/${nav.inventoryId}` : `/s/${slug}`
  const backLabel = nav.from === 'card' ? 'Card' : null

  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const { data: inventory = [], isLoading } = useInventory(slug, { inStockOnly: true })

  const [search, setSearch] = useState('')
  const [noStockModalOpen, setNoStockModalOpen] = useState(true)

  const inStore = useMemo(
    () => inventoryByArtist(inventory, artist, nav.seedItems ?? []),
    [inventory, artist, nav.seedItems],
  )

  const groupedAll = useMemo(() => groupByPrinting(inStore), [inStore])

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return groupedAll
    return groupedAll.filter(({ representative }) => {
      const card = representative.card
      return (
        card.name.toLowerCase().includes(term) ||
        (card.setName ?? '').toLowerCase().includes(term) ||
        (card.setCode ?? '').toLowerCase().includes(term)
      )
    })
  }, [groupedAll, search])

  if (!artist) {
    return (
      <div>
        <BackButton to={`/s/${slug}`}>Back to store</BackButton>
        <EmptyState
          className="mt-8"
          icon={Palette}
          title="No artist selected"
          description="Choose an artist from a card’s product details to browse their printings in this store."
        />
      </div>
    )
  }

  const storeName = store?.name ?? 'this store'
  const showNoStockModal = !isLoading && inStore.length === 0 && noStockModalOpen

  return (
    <div>
      <BackButton to={backTo}>{backLabel ? `Back to ${backLabel}` : 'Back to store'}</BackButton>

      <Modal
        open={showNoStockModal}
        onClose={() => setNoStockModalOpen(false)}
        title="No cards in this store"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setNoStockModalOpen(false)
              if (nav.from === 'card' && nav.inventoryId) {
                navigate(`/s/${slug}/cards/${nav.inventoryId}`)
              } else {
                navigate(`/s/${slug}`)
              }
            }}
          >
            {nav.from === 'card' ? 'Back to card' : 'Back to store'}
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-fg">
          <span className="font-bold">{storeName}</span> doesn’t have any in-stock cards illustrated by{' '}
          <span className="font-bold">{artist}</span> right now.
        </p>
      </Modal>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fg-muted">
            <Palette aria-hidden className="size-4" />
            Artist · in this store
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg">{artist}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {isLoading
              ? 'Checking inventory…'
              : inStore.length === 0
                ? 'Nothing in stock for this artist.'
                : `${groupedAll.length} printing${groupedAll.length === 1 ? '' : 's'} in stock`}
          </p>
        </div>
        {inStore.length > 0 && (
          <div className="w-full min-w-0 sm:max-w-xl sm:flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or set…"
              aria-label="Filter artist printings"
            />
          </div>
        )}
      </header>

      {isLoading ? (
        <StorePageLoader label="Loading store inventory…" />
      ) : inStore.length === 0 ? (
        <EmptyState
          icon={Palette}
          className="mt-10"
          title="No cards by this artist"
          description={`${storeName} has no in-stock singles credited to ${artist}.`}
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Search}
          className="mt-10"
          title="No matches"
          description="Try a different filter."
        />
      ) : (
        <Stagger
          className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-8 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          gap={0.03}
        >
          {grouped.map((entry) => (
            <StaggerItem key={entry.representative.card.id} className="h-full">
              <ArtistCardTile slug={slug} artist={artist} entry={entry} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  )
}

function ArtistCardTile({
  slug,
  artist,
  entry,
}: {
  slug: string
  artist: string
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
      state={{
        from: 'artist',
        artist,
        inventoryId: representative.id,
        gameCode: card.gameCode ?? 'mtg',
      }}
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
