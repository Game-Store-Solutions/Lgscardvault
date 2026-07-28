import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ArrowRight, Search, Store as StoreIcon } from 'lucide-react'
import api, { unwrapCollection } from '../api/client'
import type { Store } from '../api/types'
import { EmptyState, ErrorState, PageHeader, Select } from '../components/ui'
import { StoreHero, StoreCard, StoreCardSkeleton } from '../components/store'
import { useDebouncedValue } from '../hooks'

type SortKey = 'featured' | 'newest' | 'name'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
]

export default function HomePage() {
  const {
    data: stores = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const { data } = await api.get('/stores')
      return unwrapCollection<Store>(data)
    },
  })

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('featured')
  const debouncedQuery = useDebouncedValue(query, 200)
  const searching = debouncedQuery.trim() !== ''

  // The hero spotlight is an explicit platform-admin choice, not auto-picked.
  const featured = useMemo(() => stores.find((s) => s.featured), [stores])

  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const list = q
      ? stores.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
      : [...stores]
    if (sort === 'newest') {
      list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    } else if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [stores, debouncedQuery, sort])

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="h-64 animate-pulse rounded-card border border-border bg-surface" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StoreCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load stores"
        description="We couldn't reach the marketplace. Please try again."
        onRetry={() => void refetch()}
      />
    )
  }

  if (stores.length === 0) {
    return (
      <EmptyState
        icon={StoreIcon}
        title="No active stores yet"
        description="Platform admins can create one."
      />
    )
  }

  return (
    <div className="space-y-12">
      {/* Search-first hero */}
      <section className="relative overflow-hidden rounded-card border border-border bg-surface">
        <img
          src="/stock/hero-collectibles.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
        {/* Adaptive overlays (use the surface token, so they flip in dark mode) */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/95 to-surface/40" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-surface/70 to-transparent sm:from-surface/20" />
        <div className="relative max-w-2xl px-6 py-12 sm:px-10 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">LGS Card Vault</p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
            Find Magic singles from trusted local stores
          </h1>
          <p className="mt-3 max-w-xl text-base text-fg-muted">
            Browse verified storefronts, compare inventory, and shop with confidence.
          </p>

          <div className="relative mt-7 max-w-xl">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores by name…"
              aria-label="Search stores"
              className="h-14 w-full rounded-btn border border-border bg-surface pl-12 pr-4 text-base text-fg shadow-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>

          <p className="mt-4 text-sm text-fg-muted">
            <span className="font-bold text-fg">{stores.length}</span>{' '}
            {stores.length === 1 ? 'store' : 'stores'} open now
          </p>
        </div>
      </section>

      {/* Featured store — only when a platform admin has selected one */}
      {!searching && featured && (
        <section>
          <PageHeader title="Featured store" subtitle="Hand-picked by the LGS Card Vault team." className="mb-4" />
          <StoreHero
            name={featured.name}
            tagline={featured.tagline}
            heroHeading={featured.heroHeading}
            heroSubheading={featured.heroSubheading ?? 'Browse singles, compare inventory, and shop this storefront.'}
            heroImageUrl={featured.heroImageUrl?.trim() || '/stock/featured-tabletop.jpg'}
            logoUrl={featured.logoUrl}
            primaryColor={featured.primaryColor}
            accentColor={featured.accentColor}
            actions={
              <Link
                to={`/s/${featured.slug}`}
                className="inline-flex h-10 items-center gap-2 rounded-btn bg-white px-5 text-sm font-bold text-slate-900 shadow-sm transition-transform hover:-translate-y-0.5"
              >
                Visit store
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            }
          />
        </section>
      )}

      {/* All stores — sortable, searchable grid */}
      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <PageHeader
            title={searching ? 'Search results' : 'All stores'}
            subtitle={
              searching
                ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} for “${debouncedQuery.trim()}”`
                : 'Choose a storefront to view available inventory.'
            }
          />
          <Select
            aria-label="Sort stores"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-44"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </Select>
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No stores match your search"
            description={`Nothing found for “${debouncedQuery.trim()}”. Try a different name.`}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((store, i) => (
              <StoreCard key={store.id} store={store} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
