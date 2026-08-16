import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Package } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useStore, useStoreCart, useStoreSealedPublic, useStoreTheme } from '../hooks'
import { BackButton, EmptyState, Input, Pagination, Select } from '../components/ui'
import { SealedProductCard } from '../components/store/SealedProductCard'
import { StorePageLoader } from '../components/store/StorePageLoader'

const PAGE_SIZE = 24

type SortMode = 'name' | 'price-asc' | 'price-desc' | 'newest'

export default function SealedBrowsePage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const gameCode = searchParams.get('game') || undefined
  const { user } = useAuth()
  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const { data: lines = [], isLoading } = useStoreSealedPublic(slug, gameCode)
  const { query: cartQuery, setSealedItem } = useStoreCart(slug, Boolean(user))
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [page, setPage] = useState(1)

  const cart = cartQuery.data ?? []
  const gameName = lines.find((line) => line.product?.gameName)?.product?.gameName

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = term
      ? lines.filter((line) => {
          const product = line.product
          if (!product) return false
          return (
            product.name.toLowerCase().includes(term) ||
            (product.setName ?? '').toLowerCase().includes(term)
          )
        })
      : lines

    return [...rows].sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return a.priceCents - b.priceCents
        case 'price-desc':
          return b.priceCents - a.priceCents
        case 'newest':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        case 'name':
        default:
          return (a.product?.name ?? '').localeCompare(b.product?.name ?? '')
      }
    })
  }, [lines, search, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-6 pb-12 sm:space-y-8">
      <div className="space-y-4">
        <BackButton to={`/s/${slug}`}>Back to store</BackButton>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card dark:glass-card">
          <div className="relative px-5 py-6 sm:px-8 sm:py-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/8 via-transparent to-accent-500/6"
            />
            <div className="relative">
              <h1 className="inline-flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm sm:size-10">
                  <Package aria-hidden className="size-4 sm:size-5" />
                </span>
                Sealed products
              </h1>
              <p className="mt-2 max-w-xl text-sm text-fg-muted">
                Every in-stock box, bundle, and deck at {store?.name ?? 'this store'}
                {gameName ? ` · ${gameName}` : ''}.
              </p>
              <p className="mt-3 text-sm text-fg-muted">
                <span className="font-bold text-fg">{filtered.length}</span>{' '}
                {filtered.length === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label="Search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search sealed products…"
          />
        </div>
        <Select
          label="Sort"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SortMode)
            setPage(1)
          }}
          wrapperClassName="w-full shrink-0 sm:w-52"
          className="w-full"
        >
          <option value="name">Name</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="newest">Newest</option>
        </Select>
      </div>

      {isLoading ? (
        <StorePageLoader label="Loading sealed products…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search.trim() ? 'No matches' : 'No sealed products in stock'}
          description={
            search.trim()
              ? 'Try a different search term.'
              : 'This store has not listed sealed product for this game yet.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {visible.map((line) => (
              <SealedProductCard
                key={line.id}
                line={line}
                cartQty={cart.find((entry) => entry.sealedItem?.id === line.id)?.quantity ?? 0}
                pending={setSealedItem.isPending}
                onAdd={() =>
                  setSealedItem.mutate({
                    item: line,
                    quantity: (cart.find((entry) => entry.sealedItem?.id === line.id)?.quantity ?? 0) + 1,
                  })
                }
              />
            ))}
          </div>
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            totalItems={filtered.length}
          />
        </>
      )}
    </div>
  )
}
