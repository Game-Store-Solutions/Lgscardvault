import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Palette, Search } from 'lucide-react'
import type { InventoryItem } from '../api/types'
import { useBrowseQuery, useInventoryCatalog, useStore, useStoreTheme } from '../hooks'
import { BackButton, Button, EmptyState, Modal } from '../components/ui'
import { BrowsePrintingTile } from '../components/cards'
import { BrowseSearchField } from '../components/store/BrowseSearchField'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { inventoryByArtist } from '../lib/artistBrowse'
import { printingMatchesBrowseQuery } from '../lib/browseSearch'

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
  const game = searchParams.get('game')?.trim() || nav.gameCode || undefined
  const { data: inventory = [], isLoading } = useInventoryCatalog(slug, {
    artist,
    inStockOnly: true,
    game,
    enabled: Boolean(artist),
  })

  const { draft, setDraft, query } = useBrowseQuery()
  const [noStockModalOpen, setNoStockModalOpen] = useState(true)

  const inStore = useMemo(
    () => inventoryByArtist(inventory, artist, nav.seedItems ?? []),
    [inventory, artist, nav.seedItems],
  )

  const groupedAll = useMemo(() => groupByPrinting(inStore), [inStore])

  const grouped = useMemo(() => {
    if (!query) return groupedAll
    return groupedAll.filter(({ representative }) => printingMatchesBrowseQuery(representative, query))
  }, [groupedAll, query])

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
              ? inStore.length > 0
                ? `${groupedAll.length} printing${groupedAll.length === 1 ? '' : 's'} in stock`
                : 'Checking inventory…'
              : inStore.length === 0
                ? 'Nothing in stock for this artist.'
                : `${groupedAll.length} printing${groupedAll.length === 1 ? '' : 's'} in stock`}
          </p>
        </div>
        {inStore.length > 0 && (
          <BrowseSearchField
            id="artist-browse-search"
            label="Search this artist"
            placeholder="Name, set, number, type…"
            value={draft}
            onChange={setDraft}
            resultCount={grouped.length}
            totalCount={groupedAll.length}
          />
        )}
      </header>

      {isLoading && inStore.length === 0 ? (
        <StorePageLoader label="Loading artist printings…" />
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
          description="Try a card name, set code, collector number, or type."
          action={
            <Button variant="secondary" onClick={() => setDraft('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {grouped.map((entry, index) => (
            <BrowsePrintingTile
              key={entry.representative.card.id}
              slug={slug}
              entry={entry}
              priority={index < 8}
              toState={{
                from: 'artist',
                artist,
                inventoryId: entry.representative.id,
                gameCode: entry.representative.card.gameCode ?? 'mtg',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

