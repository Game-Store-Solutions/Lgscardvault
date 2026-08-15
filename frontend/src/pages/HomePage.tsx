import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ArrowRight, Search, Store } from 'lucide-react'
import api, { unwrapCollection } from '../api/client'
import type { Store as StoreType } from '../api/types'
import { EmptyState, ErrorState, PageHeader, Select } from '../components/ui'
import { StoreHero, StoreCard, StoreCardSkeleton } from '../components/store'
import MarketplaceLanding from '../components/MarketplaceLanding'
import { BrandLogo } from '../components/BrandLogo'
import { FloatingCardsBackdrop } from '../components/FloatingCardsBackdrop'
import { useDebouncedValue } from '../hooks'
import { useAuth } from '../context/AuthContext'

type SortKey = 'featured' | 'newest' | 'name'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
]

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  const {
    data: stores = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const { data } = await api.get('/stores')
      return unwrapCollection<StoreType>(data)
    },
    enabled: !authLoading && !!user,
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

  // Logged-out visitors always see the marketing landing — separates guest vs app.
  if (!authLoading && !user) {
    return <MarketplaceLanding />
  }

  if (authLoading || isLoading) {
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
        icon={Store}
        title="No active stores yet"
        description="Once a store opens on the marketplace, it will show up here."
      />
    )
  }

  return (
    <div className="space-y-12">
      {/* Search-first hero */}
      <section className="relative overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.04] dark:ring-white/10">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_85%_40%,rgba(198,160,53,0.12),transparent_55%),linear-gradient(135deg,#fafafa_0%,#f3f4f6_55%,#e5e7eb_100%)] dark:bg-[radial-gradient(ellipse_70%_80%_at_85%_40%,rgba(220,38,38,0.14),transparent_55%),linear-gradient(135deg,#0a0a0b_0%,#171717_60%,#0a0a0b_100%)]"
        />
        <FloatingCardsBackdrop
          layout="right"
          washClassName="bg-gradient-to-r from-surface via-surface/92 to-surface/25 dark:from-[#171717] dark:via-[#171717]/88 dark:to-[#171717]/20"
        />
        <div className="relative max-w-2xl px-6 py-12 sm:px-10 sm:py-16">
          <BrandLogo size="lg" variant="auto" to={null} />
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
            Find singles from trusted local stores
          </h1>
          <p className="mt-3 max-w-xl text-base text-fg-muted">
            Magic, Pokémon, One Piece, Flesh &amp; Blood. Browse verified storefronts and shop with confidence.
          </p>

          <div className="relative mt-7 max-w-xl">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores by name…"
              aria-label="Search stores"
              className="h-14 w-full rounded-btn border-0 bg-surface pl-12 pr-4 text-base text-fg shadow-sm ring-1 ring-black/[0.06] placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:ring-white/10"
            />
          </div>

          <p className="mt-4 text-sm text-fg-muted">
            <span className="font-bold text-fg">{stores.length}</span>{' '}
            {stores.length === 1 ? 'store' : 'stores'} open now
          </p>
        </div>
      </section>

      {/* Featured store. Only when a platform admin has selected one */}
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

      {/* All stores. Sortable, searchable grid */}
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
