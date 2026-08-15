import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  Calendar,
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
import { formatPrice, parsePriceInput } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useCanManageStore, useDebouncedValue, useInventoryPage, useStore, useStoreCart, useStoreGameShelf, useStoreGames, useStoreTheme } from '../hooks'
import { GameSelector } from '../components/catalog'
import { Button, buttonVariants, EmptyState, Input, Pagination, Select, InventoryGridSkeleton, Skeleton } from '../components/ui'
import { CardRow, CardTile, MarketplaceCard, SpotlightCard } from '../components/cards'
import { buildHeroCardPool } from '../components/store/hero/heroCardPool'
import { normalizeHeroLayout } from '../components/store/hero/heroLayouts'
import { StoreHero } from '../components/store/StoreHero'
import { TradePromoBanner } from '../components/store/TradePromoBanner'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { SealedSpotlightRow } from '../components/store/SealedSpotlightRow'
import { cx } from '../lib/cx'
import { colorIdentityKey } from '../lib/mtg'
import { ManaSymbol } from '../components/mtg/ManaSymbol'
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
  const [gameFilter, setGameFilter] = useState('')
  const railRef = useRef<HTMLDivElement>(null)
  const searchSectionRef = useRef<HTMLDivElement>(null)

  const { data: store, isLoading: storeLoading } = useStore(slug)
  useStoreTheme(store)
  const cardDisplayStyle = store?.cardDisplayStyle ?? 'gallery'

  const { data: storeGames = [], isLoading: gamesLoading } = useStoreGames(slug)
  const gameOptions = useMemo(
    () => storeGames.map((game) => ({ code: game.code, name: game.name })),
    [storeGames],
  )
  useEffect(() => {
    if (!gameFilter && gameOptions.length > 0) {
      setGameFilter(gameOptions[0].code)
    }
  }, [gameFilter, gameOptions])

  const debouncedSearch = useDebouncedValue(search, 300)
  const minPriceCents = parsePriceInput(minPrice)
  const maxPriceCents = parsePriceInput(maxPrice)
  const catalogEnabled = Boolean(gameFilter) || (!gamesLoading && storeGames.length === 0)

  const catalog = useInventoryPage(slug, {
    inStockOnly: true,
    game: gameFilter || undefined,
    q: debouncedSearch,
    set: setFilter,
    type: typeFilter,
    finish: finishFilter,
    colors: selectedColors.length > 0 ? colorIdentityKey(selectedColors) : undefined,
    minPriceCents,
    maxPriceCents,
    sort,
    page,
    itemsPerPage: RESULTS_PAGE_SIZE,
    enabled: catalogEnabled,
  })
  const spotlight = useInventoryPage(slug, {
    inStockOnly: true,
    game: gameFilter || undefined,
    sort: 'price-desc',
    minPriceCents: store?.spotlightMinPriceCents ?? DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS,
    page: 1,
    itemsPerPage: SPOTLIGHT_MAX_ITEMS,
    enabled: catalogEnabled,
  })
  const { data: shelf } = useStoreGameShelf(slug, gameFilter)

  const inventory = catalog.data?.items ?? []
  const resultTotal = catalog.data?.total ?? 0
  const spotlightItems = spotlight.data?.items ?? []
  const availableSets = shelf?.sets ?? []

  const { query: cartQuery, setItem: cartSetItem } = useStoreCart(slug, Boolean(user))
  const cartByItemId = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of cartQuery.data ?? []) {
      if (entry.inventoryItem) map.set(entry.inventoryItem.id, entry.quantity)
    }
    return map
  }, [cartQuery.data])

  const heroShowcaseCards = useMemo(
    () => buildHeroCardPool(spotlightItems.length > 0 ? spotlightItems : inventory, 20),
    [spotlightItems, inventory],
  )
  const heroLayout = normalizeHeroLayout(store?.heroLayout ?? 'cinematic')
  const locationLabel = [store?.city, store?.region].filter(Boolean).join(', ') || null

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, setFilter, typeFilter, finishFilter, selectedColors, minPrice, maxPrice, sort, gameFilter])

  // Filters describe one game's cards (sets, colors, types), so switching
  // games clears them rather than silently returning nothing.
  useEffect(() => {
    setSetFilter('')
    setTypeFilter('')
    setSelectedColors([])
  }, [gameFilter])

  const resultsPageCount = Math.max(1, Math.ceil(resultTotal / RESULTS_PAGE_SIZE))
  const currentResultsPage = Math.min(page, resultsPageCount)
  const visibleResults = inventory
  const listingsLoading = catalog.isPending && !catalog.data
  const listingsRefreshing = catalog.isFetching && catalog.isPlaceholderData
  const spotlightLoading = spotlight.isPending && !spotlight.data

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

  if (gameOptions.length > 1 && gameFilter) {
    chips.push({
      label: gameOptions.find((g) => g.code === gameFilter)?.name ?? gameFilter,
      onClear: () => setGameFilter(gameOptions[0]?.code ?? ''),
    })
  }

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
        {gameOptions.length > 1 && (
          <Select label="Game" value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
            {gameOptions.map((game) => (
              <option key={game.code} value={game.code}>
                {game.name}
              </option>
            ))}
          </Select>
        )}

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
              placeholder="Name, type, color, or set"
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
              const active = selectedColors.includes(color.key)
              return (
                <button
                  key={color.key}
                  type="button"
                  onClick={() => toggleColor(color.key)}
                  aria-pressed={active}
                  title={`${color.label} only`}
                  className={cx(
                    'grid place-items-center rounded-full transition-all',
                    active ? 'scale-110 ring-2 ring-brand-500 ring-offset-2 ring-offset-bg' : 'opacity-85 hover:opacity-100',
                  )}
                >
                  <ManaSymbol symbol={color.key} className="size-8" />
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
            <Input label="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
            <Input label="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="50" />
          </div>
        </div>
      </div>
    )
  }

  if (storeLoading) {
    return <StorePageLoader label="Loading store…" />
  }

  return (
    <div className="storefront-atmosphere relative space-y-10">
      <StoreHero
        name={store?.name ?? slug}
        slug={slug}
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
        layout={heroLayout}
        communityEvents={store?.communityEvents}
        locationLabel={locationLabel}
        verified={store?.status === 'approved'}
        stats={{
          listings: shelf?.listings ?? resultTotal,
          cards: shelf?.copies ?? 0,
          sets: availableSets.length,
        }}
        showcaseCards={heroShowcaseCards}
        actions={
          <>
            <Link to={`/s/${slug}/events`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Calendar aria-hidden className="size-4" />
              Event calendar
            </Link>
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
        <span className="font-bold text-fg">{shelf?.listings ?? resultTotal}</span> listings ·{' '}
        <span className="font-bold text-fg">{shelf?.copies ?? 0}</span> cards ·{' '}
        <span className="font-bold text-fg">{availableSets.length}</span> sets ·{' '}
        <Link
          to={`/s/${slug}/events`}
          className="font-bold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
        >
          Event calendar
        </Link>
      </p>

      {/* Quick actions — themed shortcut tiles over the spotlight */}
      <section className="space-y-5">
        <p className="mx-auto max-w-2xl text-center text-sm text-fg/75 sm:text-base">
          Browse thousands of in-stock singles, build decks, sell or trade your collection.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map(({ label, icon: Icon, path, action }) => {
            const tileClass =
              'group flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface px-4 py-8 text-fg shadow-card ui-lift hover:border-brand-500/40 dark:border-white/10 dark:bg-white/[0.04]'
            const content = (
              <>
                <span className="grid size-12 place-items-center rounded-xl border border-brand-500/25 bg-brand-500/12 text-brand-600 shadow-sm transition-all duration-300 group-hover:border-brand-500/40 group-hover:bg-brand-500/18 group-hover:shadow-[var(--shadow-glow)] dark:text-brand-300">
                  <Icon aria-hidden className="size-6" />
                </span>
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

      {/* Game switcher — only when this store actually carries more than one */}
      {gameOptions.length > 1 && (
        <section aria-label="Choose a game">
          <GameSelector games={gameOptions} value={gameFilter} onChange={setGameFilter} label="Browse by game" />
        </section>
      )}

      {/* Spotlight — holographic cards in a lively persistent rail */}
      {(spotlightLoading || spotlightItems.length > 0) && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg">
                <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                  <Sparkles aria-hidden className="size-4" />
                </span>
                Spotlight{gameFilter ? ` · ${gameOptions.find((g) => g.code === gameFilter)?.name ?? ''}` : ''}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Premium singles over {formatPrice(store?.spotlightMinPriceCents ?? DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS)} market
              </p>
            </div>
          </div>
          {spotlightLoading ? (
            <div
              className="flex gap-4 overflow-hidden pl-14"
              aria-busy="true"
              aria-label="Loading spotlight"
            >
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-64 w-40 flex-shrink-0 rounded-card" />
              ))}
            </div>
          ) : (
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
          )}
        </section>
      )}

      {/* Sealed spotlight — scoped to the same game as everything else */}
      <SealedSpotlightRow slug={slug} gameCode={gameFilter} />

      <div ref={searchSectionRef} id="store-search" className="scroll-mt-24 grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-card border border-border bg-surface p-5 shadow-card dark:glass-card">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-fg">Browse</h2>
                <p className="text-sm text-fg-muted">{resultTotal} {resultTotal === 1 ? 'result' : 'results'}</p>
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
                  <span className="font-bold text-fg">{resultTotal}</span> {resultTotal === 1 ? 'result' : 'results'}
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
              {gameOptions.length > 1 && (
                <Select
                  aria-label="Filter by game"
                  value={gameFilter}
                  onChange={(e) => setGameFilter(e.target.value)}
                  className="w-full min-w-[10rem] sm:w-44 lg:hidden"
                >
                  {gameOptions.map((game) => (
                    <option key={game.code} value={game.code}>
                      {game.name}
                    </option>
                  ))}
                </Select>
              )}
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

          {listingsLoading ? (
            <InventoryGridSkeleton count={12} />
          ) : resultTotal === 0 ? (
            <div className="rounded-card border border-border bg-surface dark:glass-card">
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
            <div className={cx('space-y-6', listingsRefreshing && 'opacity-70')}>
              {cardDisplayStyle === 'marketplace' ? (
                <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
                  {visibleResults.map((item) => (
                    <MarketplaceCard
                      key={item.id}
                      item={item}
                      slug={slug}
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
              <Pagination page={currentResultsPage} pageCount={resultsPageCount} onPageChange={setPage} totalItems={resultTotal} />
            </div>
          )}
        </main>
      </div>

      {/* Advanced filters — mobile bottom-sheet drawer */}
      {advancedOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" aria-hidden onClick={() => setAdvancedOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-border bg-surface p-5 shadow-xl dark:glass-card-elevated">
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
                Show {resultTotal} {resultTotal === 1 ? 'result' : 'results'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
