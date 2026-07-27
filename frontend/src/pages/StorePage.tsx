import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store as StoreIcon,
  UserCircle,
  X,
} from 'lucide-react'
import { formatPrice, parsePriceInput, scryfallPriceCents } from '../api/client'
import type { InventoryItem } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { useCanManageStore, useCart, useInventory, useStore, useStoreTheme } from '../hooks'
import { Button, buttonVariants, EmptyState, Input, LoadingPanel, Pagination, Select } from '../components/ui'
import { CardRow, CardTile, MarketplaceCard, SpotlightCard } from '../components/cards'
import { StoreHero } from '../components/store/StoreHero'
import { TradePromoBanner } from '../components/store/TradePromoBanner'
import { cx } from '../lib/cx'
import { MANA_COLORS } from '../lib/mtg'
import {
    QUICK_ACTIONS,
    SORTS,
    CARD_TYPES,
    FINISH_OPTIONS,
    COLORS,
    DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS,
    SPOTLIGHT_MAX_ITEMS,
    RESULTS_PAGE_SIZE,
    type FinishFilter,
    type ViewMode,
    type SortKey
 } from './utils/actionsUtil.tsx'





function cardColors(item: InventoryItem): string[] {
  const identity = item.card.colorIdentity ?? item.card.colors ?? []
  return identity.length > 0 ? identity : ['C']
}

function marketPriceCents(item: InventoryItem): number | null {
  return scryfallPriceCents(item.card, item.isFoil ? 'foil' : 'nonfoil')
}

export default function StorePage() {
  const { slug = '' } = useParams()
  const canManage = useCanManageStore(slug)
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [setFilter, setSetFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [finishFilter, setFinishFilter] = useState<FinishFilter>('all')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortKey>('featured')
  const [view, setView] = useState<ViewMode>('grid')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [page, setPage] = useState(1)
  const railRef = useRef<HTMLDivElement>(null)
  const searchSectionRef = useRef<HTMLDivElement>(null)

  const { data: store } = useStore(slug)
  useStoreTheme(store)
  const cardDisplayStyle = store?.cardDisplayStyle ?? 'gallery'

  const { data: inventory = [], isLoading } = useInventory(slug)
  const { query: cartQuery, setItem: cartSetItem } = useCart(slug, Boolean(user))
  const cartByItemId = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of cartQuery.data ?? []) {
      map.set(entry.inventoryItem.id, entry.quantity)
    }
    return map
  }, [cartQuery.data])

  // code → display name; the option value stays the code (stable, matches the
  // filter) while the label shows the human-readable set name.
  const availableSets = useMemo(() => {
    const bySet = new Map<string, string>()
    for (const item of inventory) {
      const code = item.card.setCode
      if (code && !bySet.has(code)) bySet.set(code, item.card.setName || code.toUpperCase())
    }
    return Array.from(bySet, ([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [inventory])

  const colorCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of inventory) for (const c of cardColors(item)) counts[c] = (counts[c] ?? 0) + 1
    return counts
  }, [inventory])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const setTerm = setFilter.trim().toLowerCase()
    const typeTerm = typeFilter.trim().toLowerCase()
    const minPriceCents = parsePriceInput(minPrice)
    const maxPriceCents = parsePriceInput(maxPrice)

    return inventory.filter((item) => {
      const colors = cardColors(item)
      const matchesTerm =
        !term ||
        item.card.name.toLowerCase().includes(term) ||
        (item.card.setCode ?? '').toLowerCase().includes(term) ||
        (item.card.setName ?? '').toLowerCase().includes(term) ||
        (item.card.typeLine ?? '').toLowerCase().includes(term) ||
        (item.card.oracleText ?? '').toLowerCase().includes(term) ||
        colors.some((color) => color.toLowerCase().includes(term))
      const matchesSet =
        !setTerm ||
        (item.card.setCode ?? '').toLowerCase() === setTerm ||
        (item.card.setName ?? '').toLowerCase().includes(setTerm)
      const matchesType = !typeTerm || (item.card.typeLine ?? '').toLowerCase().includes(typeTerm)
      const matchesFinish =
        finishFilter === 'all' ||
        (finishFilter === 'foil' && item.isFoil) ||
        (finishFilter === 'nonfoil' && !item.isFoil)
      const matchesColors = selectedColors.length === 0 || selectedColors.every((sel) => colors.includes(sel))
      const priceCents = marketPriceCents(item)
      const matchesMinPrice = minPriceCents === null || (priceCents !== null && priceCents >= minPriceCents)
      const matchesMaxPrice = maxPriceCents === null || (priceCents !== null && priceCents <= maxPriceCents)

      return (
        matchesTerm && matchesSet && matchesType && matchesFinish && matchesColors && matchesMinPrice && matchesMaxPrice
      )
    })
  }, [inventory, search, setFilter, typeFilter, finishFilter, selectedColors, minPrice, maxPrice])

  const sorted = useMemo(() => {
    const list = [...filtered]
    switch (sort) {
      case 'price-desc':
        list.sort((a, b) => (marketPriceCents(b) ?? -1) - (marketPriceCents(a) ?? -1))
        break
      case 'price-asc':
        list.sort((a, b) => (marketPriceCents(a) ?? Number.POSITIVE_INFINITY) - (marketPriceCents(b) ?? Number.POSITIVE_INFINITY))
        break
      case 'name':
        list.sort((a, b) => a.card.name.localeCompare(b.card.name))
        break
      case 'newest':
        list.sort((a, b) => (b.card.releasedAt ?? '').localeCompare(a.card.releasedAt ?? ''))
        break
    }
    return list
  }, [filtered, sort])

  const spotlightItems = useMemo(() => {
    const threshold = store?.spotlightMinPriceCents ?? DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS
    return inventory
      .map((item) => ({ item, priceCents: marketPriceCents(item) }))
      .filter(({ priceCents }) => priceCents !== null && priceCents >= threshold)
      .sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0))
      .map(({ item }) => item)
      .slice(0, SPOTLIGHT_MAX_ITEMS)
  }, [inventory, store?.spotlightMinPriceCents])

  const totalCards = inventory.reduce((sum, item) => sum + item.quantity, 0)

  useEffect(() => {
    setPage(1)
  }, [search, setFilter, typeFilter, finishFilter, selectedColors, minPrice, maxPrice, sort])

  const resultsPageCount = Math.max(1, Math.ceil(sorted.length / RESULTS_PAGE_SIZE))
  const currentResultsPage = Math.min(page, resultsPageCount)
  const visibleResults = sorted.slice((currentResultsPage - 1) * RESULTS_PAGE_SIZE, currentResultsPage * RESULTS_PAGE_SIZE)

  function toggleColor(color: string) {
    setSelectedColors((current) =>
      current.includes(color) ? current.filter((value) => value !== color) : [...current, color],
    )
  }

  function clearFilters() {
    setSearch('')
    setSetFilter('')
    setTypeFilter('')
    setFinishFilter('all')
    setSelectedColors([])
    setMinPrice('')
    setMaxPrice('')
  }

  function scrollRail(direction: 1 | -1) {
    const el = railRef.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  function focusVisibleSearchInput() {
    const inputs = ['store-search-sidebar', 'store-search-drawer']
      .map((id) => document.getElementById(id) as HTMLInputElement | null)
      .filter((el): el is HTMLInputElement => Boolean(el))
    const visible = inputs.find((el) => el.offsetParent !== null)
    visible?.focus({ preventScroll: true })
  }

  function scrollToSearchSection() {
    searchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(focusVisibleSearchInput, 350)
  }

  const advancedCount = (setFilter ? 1 : 0) + (typeFilter.trim() ? 1 : 0) + (minPrice.trim() ? 1 : 0) + (maxPrice.trim() ? 1 : 0)

  const chips: { label: string; onClear: () => void }[] = []

  if (search.trim()) chips.push({ label: `“${search.trim()}”`, onClear: () => setSearch('') })

  if (setFilter)
    chips.push({
      label: `Set: ${availableSets.find((s) => s.code === setFilter)?.name ?? setFilter.toUpperCase()}`,
      onClear: () => setSetFilter(''),
    })

  if (typeFilter.trim()) chips.push({ label: `Type: ${typeFilter.trim()}`, onClear: () => setTypeFilter('') })

  if (finishFilter !== 'all')
    chips.push({ label: FINISH_OPTIONS.find((f) => f.key === finishFilter)!.label, onClear: () => setFinishFilter('all') })
  for (const c of selectedColors) {
    const label = COLORS.find((x) => x.key === c)?.label ?? c
    chips.push({ label, onClear: () => toggleColor(c) })
  }

  if (minPrice.trim()) chips.push({ label: `Min $${minPrice.trim()}`, onClear: () => setMinPrice('') })

  if (maxPrice.trim()) chips.push({ label: `Max $${maxPrice.trim()}`, onClear: () => setMaxPrice('') })

  function renderFilterControls(searchId: string) {
    return (
      <div className="space-y-6">
        <div>
          <label htmlFor={searchId} className="text-sm font-bold text-fg">
            Search
          </label>
          <div className="relative mt-1.5">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, type, color, or text"
              aria-label="Search inventory"
              className="h-10 w-full rounded-btn border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-fg">Finish</p>
          <div className="grid grid-cols-3 overflow-hidden rounded-btn border border-border">
            {FINISH_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFinishFilter(option.key)}
                aria-pressed={finishFilter === option.key}
                className={cx(
                  'border-r border-border px-2 py-2 text-xs font-bold transition-colors last:border-r-0',
                  finishFilter === option.key ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-fg">Color</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => {
              const c = MANA_COLORS[color.key]
              const active = selectedColors.includes(color.key)
              return (
                <button
                  key={color.key}
                  type="button"
                  onClick={() => toggleColor(color.key)}
                  aria-pressed={active}
                  title={`${color.label} · ${colorCounts[color.key] ?? 0} cards`}
                  className={cx(
                    'grid size-8 place-items-center rounded-full border text-xs font-black transition-all',
                    active
                      ? 'scale-110 border-transparent ring-2 ring-brand-500 ring-offset-2 ring-offset-bg'
                      : 'border-black/10 opacity-85 hover:opacity-100',
                  )}
                  style={{ backgroundColor: c, color: color.dark ? '#1c1a2e' : '#fff' }}
                >
                  {color.key}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <Select label="Set" value={setFilter} onChange={(e) => setSetFilter(e.target.value)}>
            <option value="">All sets</option>
            {availableSets.map((set) => (
              <option key={set.code} value={set.code}>
                {set.name}
              </option>
            ))}
          </Select>
          <Select label="Card type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {CARD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Min market" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
            <Input label="Max market" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="50" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-10">
      <StoreHero
        name={store?.name ?? slug}
        tagline={store?.tagline}
        heroHeading={store?.heroHeading}
        heroSubheading={
          store?.heroSubheading ||
          'Browse available Magic singles and compare printings, condition, colors, and prices.'
        }
        heroImageUrl={store?.heroImageUrl}
        logoUrl={store?.logoUrl}
        primaryColor={store?.primaryColor}
        accentColor={store?.accentColor}
        actions={
          <>
            {user && (
              <Link to={`/s/${slug}/account`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <UserCircle aria-hidden className="size-4" />
                My account
              </Link>
            )}
            {canManage && (
              <Link to={`/s/${slug}/admin`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <StoreIcon aria-hidden className="size-4" />
                Admin workspace
              </Link>
            )}
          </>
        }
      />

      <TradePromoBanner slug={slug} showSellLink />

      {/* Slim stat line */}
      <p className="text-sm text-fg-muted">
        <span className="font-bold text-fg">{inventory.length}</span> listings ·{' '}
        <span className="font-bold text-fg">{totalCards}</span> cards ·{' '}
        <span className="font-bold text-fg">{availableSets.length}</span> sets
      </p>

      {/* Quick actions — themed shortcut tiles over the spotlight */}
      <section className="space-y-5">
        <p className="mx-auto max-w-2xl text-center text-sm text-fg-muted sm:text-base">
          Browse thousands of in-stock singles, build decks, sell or trade your collection.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_ACTIONS.map(({ label, icon: Icon, path, action }) => {
            const tileClass =
              'flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface px-4 py-8 text-fg shadow-card transition-colors hover:border-brand-500 hover:bg-bg'
            const content = (
              <>
                <Icon aria-hidden className="size-6 text-fg-muted" />
                <span className="text-sm font-bold">{label}</span>
              </>
            )
            return path ? (
              <Link key={label} to={`/s/${slug}/${path}`} className={tileClass}>
                {content}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                className={tileClass}
                onClick={action === 'search' ? scrollToSearchSection : undefined}
              >
                {content}
              </button>
            )
          })}
        </div>
      </section>

      {/* Spotlight — holographic cards in a lively persistent rail */}
      {spotlightItems.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg">
                <span className="grid size-8 place-items-center rounded-btn bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                  <Sparkles aria-hidden className="size-4" />
                </span>
                Spotlight
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Premium singles over {formatPrice(store?.spotlightMinPriceCents ?? DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS)} market
              </p>
            </div>
          </div>
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent" />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg to-transparent" />
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              aria-label="Scroll spotlight left"
              className="absolute left-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/95 text-fg-muted shadow-md backdrop-blur transition-colors hover:text-brand-600 sm:grid"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollRail(1)}
              aria-label="Scroll spotlight right"
              className="absolute right-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/95 text-fg-muted shadow-md backdrop-blur transition-colors hover:text-brand-600 sm:grid"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
            <div
              ref={railRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-14 pb-2 pl-14 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {spotlightItems.map((item, i) => (
                <SpotlightCard key={item.id} item={item} slug={slug} ribbon={i === 0 ? 'Featured' : undefined} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div ref={searchSectionRef} id="store-search" className="scroll-mt-24 grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-card border border-border bg-surface p-5 shadow-card">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-fg">Browse</h2>
                <p className="text-sm text-fg-muted">{sorted.length} {sorted.length === 1 ? 'result' : 'results'}</p>
              </div>
              {chips.length > 0 && (
                <button type="button" onClick={clearFilters} className="text-xs font-bold text-brand-600 hover:underline">
                  Clear
                </button>
              )}
            </div>
            {renderFilterControls('store-search-sidebar')}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold tracking-tight text-fg">Singles</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm text-fg-muted">
                  <span className="font-bold text-fg">{sorted.length}</span> {sorted.length === 1 ? 'result' : 'results'}
                </span>
                {chips.length > 0 && <span aria-hidden className="text-fg-muted">·</span>}
                {chips.map((chip, i) => (
                  <button
                    key={`${chip.label}-${i}`}
                    type="button"
                    onClick={chip.onClear}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:text-brand-600"
                  >
                    {chip.label}
                    <X aria-hidden className="size-3" />
                  </button>
                ))}
                {chips.length > 0 && (
                  <button type="button" onClick={clearFilters} className="text-xs font-bold text-brand-600 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="md" className="lg:hidden" onClick={() => setAdvancedOpen(true)}>
                <SlidersHorizontal aria-hidden className="size-4" />
                Filters{advancedCount > 0 || chips.length > 0 ? ` (${chips.length})` : ''}
              </Button>
              <Select aria-label="Sort cards" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-44">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    Sort: {s.label}
                  </option>
                ))}
              </Select>
              {cardDisplayStyle === 'gallery' ? (
                <div className="flex overflow-hidden rounded-btn border border-border">
                  <button
                    type="button"
                    onClick={() => setView('grid')}
                    aria-label="Grid view"
                    aria-pressed={view === 'grid'}
                    className={cx('grid size-10 place-items-center', view === 'grid' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg')}
                  >
                    <LayoutGrid aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    aria-label="List view"
                    aria-pressed={view === 'list'}
                    className={cx('grid size-10 place-items-center border-l border-border', view === 'list' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-fg-muted hover:text-fg')}
                  >
                    <ListIcon aria-hidden className="size-4" />
                  </button>
                </div>
              ) : (
                <span className="inline-flex h-10 items-center gap-2 rounded-btn border border-border bg-brand-50 px-3 text-sm font-bold text-brand-700">
                  <ShoppingCart aria-hidden className="size-4" />
                  Marketplace cards
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <LoadingPanel label="Loading inventory…" />
          ) : sorted.length === 0 ? (
            <div className="rounded-card border border-border bg-surface">
              <EmptyState
                icon={Search}
                title="No matching cards"
                description="No inventory matches these filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-6">
              {cardDisplayStyle === 'marketplace' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleResults.map((item) => (
                    <MarketplaceCard
                      key={item.id}
                      item={item}
                      slug={slug}
                      signedIn={Boolean(user)}
                      inCartQuantity={cartByItemId.get(item.id)}
                      adding={cartSetItem.isPending && cartSetItem.variables?.item.id === item.id}
                      onAddToCart={() => cartSetItem.mutate({ item, quantity: 1 })}
                    />
                  ))}
                </div>
              ) : view === 'grid' ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {visibleResults.map((item) => (
                    <CardTile key={item.id} item={item} slug={slug} />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleResults.map((item) => (
                    <CardRow key={item.id} item={item} slug={slug} />
                  ))}
                </div>
              )}
              <Pagination page={currentResultsPage} pageCount={resultsPageCount} onPageChange={setPage} totalItems={sorted.length} />
            </div>
          )}
        </main>
      </div>

      {/* Advanced filters — mobile bottom-sheet drawer */}
      {advancedOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" aria-hidden onClick={() => setAdvancedOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-border bg-surface p-5 shadow-xl">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-fg">Filters</h2>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                aria-label="Close filters"
                className="grid size-9 place-items-center rounded-btn text-fg-muted hover:text-fg"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            {renderFilterControls('store-search-drawer')}
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={clearFilters}>
                Clear all
              </Button>
              <Button className="flex-1" onClick={() => setAdvancedOpen(false)}>
                Show {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
