import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  Check,
  CheckCircle2,
  Crown,
  Fuel,
  Gem,
  Layers,
  Search,
  ShoppingCart,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react'
import { cardImage, formatPrice } from '../api/client'
import type { InventoryItem } from '../api/types'
import { useAuth } from '../context/AuthContext'
import {
  useCart,
  useCommanderCombos,
  useCommanderDeck,
  useCommanderNextCards,
  useCommanderRecommendations,
  useCommanderSearch,
  useCommanderStrategies,
  useStore,
  useStoreTheme,
  useDebouncedValue,
} from '../hooks'
import type {
  CommanderRecommendation,
  CommanderSummary,
  DeckCardType,
  DeckRole,
  IntelligenceProvenance,
  SpellbookCombo,
} from '../hooks'
import {
  Badge,
  Button,
  BackButton,
  buttonVariants,
  EmptyState,
  Input,
  LoadingPanel,
  Select,
  Skeleton,
  Tabs,
  TabPanel,
} from '../components/ui'
import { CardImage } from '../components/cards'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { ManaSymbol } from '../components/mtg/ManaSymbol'
import { finishName } from '../lib/finishes'
import { cx } from '../lib/cx'
import { useAppShellFlush } from '../components/layout/AppShellLayout'
import {
  dollarsToCents,
  loadDeckBuilderSession,
  parseDeckBuilderBracket,
  parseDeckBuilderPanel,
  parseDeckBuilderView,
  saveDeckBuilderSession,
  type DeckBuilderNavState,
} from '../lib/deckBuilder'

const ROLE_META: Record<DeckRole, { label: string; blurb: string; icon: typeof Zap }> = {
  enabler: {
    label: 'Enablers',
    blurb: 'Pieces that start or assemble the strategy.',
    icon: Zap,
  },
  fuel: {
    label: 'Fuel',
    blurb: 'Cards that keep the engine running turn after turn.',
    icon: Fuel,
  },
  payoff: {
    label: 'Payoffs',
    blurb: 'Cards that convert the strategy into wins and value.',
    icon: Gem,
  },
  support: {
    label: 'Support',
    blurb: 'Ramp, draw, interaction, and lands that round out the list.',
    icon: Layers,
  },
}

const TYPE_ORDER: DeckCardType[] = [
  'creature',
  'enchantment',
  'instant',
  'sorcery',
  'artifact',
  'land',
  'planeswalker',
  'other',
]

const TYPE_LABELS: Record<DeckCardType, string> = {
  creature: 'Creatures',
  enchantment: 'Enchantments',
  instant: 'Instants',
  sorcery: 'Sorceries',
  artifact: 'Artifacts',
  land: 'Lands',
  planeswalker: 'Planeswalkers',
  other: 'Other',
}

function colorPips(identity: string[] | undefined) {
  const colors = identity && identity.length > 0 ? identity : ['C']
  return (
    <span className="inline-flex items-center gap-0.5">
      {colors.map((c) => (
        <ManaSymbol key={c} symbol={c} className="size-4" />
      ))}
    </span>
  )
}

/** Honest one-liner for how thick the reference sample behind a package is. */
function intelligenceSummary(intel: IntelligenceProvenance | undefined): string | null {
  if (!intel) return null
  const conf = Math.round(intel.confidence * 100)
  const sample = intel.sampleSize
  const scope = intel.exactMatch
    ? 'exact strategy match'
    : `fallback · ${intel.level.replaceAll('_', ' ')}`
  return `${conf}% confidence · ${sample} reference deck${sample === 1 ? '' : 's'} · ${scope}`
}

function RecRow({
  row,
  slug,
  signedIn,
  inCart,
  checked,
  disabledPick,
  adding,
  linkState,
  onToggle,
  onAdd,
}: {
  row: CommanderRecommendation
  slug: string
  signedIn: boolean
  inCart: number
  checked: boolean
  disabledPick: boolean
  adding: boolean
  linkState?: DeckBuilderNavState
  onToggle: () => void
  onAdd: () => void
}) {
  const item = row.inventoryItem
  const match = Math.round(row.score * 100)
  const roleLabel = ROLE_META[row.role]?.label ?? row.role
  // Stock is a scoring signal rather than a filter, so a card the store does
  // not carry is still worth recommending — it just cannot be added to a cart.
  const name = item?.card.name ?? row.card.name
  const typeLine = item?.card.typeLine ?? row.card.typeLine
  const image = cardImage(item?.card ?? row.card)
  const detailPath = item ? `/s/${slug}/cards/${item.id}` : null

  const title = detailPath ? (
    <Link
      to={detailPath}
      state={linkState}
      className="font-display text-sm font-bold text-fg transition-colors hover:text-brand-600 sm:text-[0.95rem]"
    >
      {name}
    </Link>
  ) : (
    <span className="font-display text-sm font-bold text-fg sm:text-[0.95rem]">{name}</span>
  )

  return (
    <li
      className={cx(
        'group grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-3 rounded-card border bg-surface p-3 transition-colors duration-200 sm:items-center',
        checked
          ? 'border-brand-400/70 bg-brand-50/40 dark:bg-brand-500/10'
          : 'border-border hover:border-brand-400/40 hover:bg-bg/60',
        !item && 'opacity-80',
      )}
    >
      <label className="flex items-center self-center">
        <input
          type="checkbox"
          className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
          checked={checked}
          disabled={disabledPick || !item}
          onChange={onToggle}
          aria-label={`Select ${name}`}
        />
      </label>
      {detailPath ? (
        <Link
          to={detailPath}
          state={linkState}
          className="w-12 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-14"
        >
          <CardImage src={image} alt={name} className="aspect-5/7 w-full" />
        </Link>
      ) : (
        <div className="w-12 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-14">
          <CardImage src={image} alt={name} className="aspect-5/7 w-full" />
        </div>
      )}
      <div className="min-w-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
        <div className="min-w-0">
          {title}
          <p className="mt-0.5 truncate text-xs text-fg-muted">
            {typeLine}
            {item ? (
              <>
                {' · '}
                {item.condition} / {finishName(item.card, item.isFoil, item.finish)}
                {' · '}
                {item.quantity} in stock
              </>
            ) : (
              ' · not in stock here'
            )}
          </p>
          {row.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {row.reasons.slice(0, 3).map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-bg px-2 py-0.5 text-[0.65rem] font-semibold text-fg-muted"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 sm:mt-0 sm:flex-col sm:items-end sm:justify-center">
          <div className="text-right">
            <p className="font-display text-base font-extrabold tracking-tight text-fg">
              {item ? formatPrice(item.priceCents) : '—'}
            </p>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-muted">
              {roleLabel} · {match}% match
            </p>
          </div>
          {!item ? (
            <span className="rounded-full border border-border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-fg-muted">
              Not stocked
            </span>
          ) : !signedIn ? (
            <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Sign in
            </Link>
          ) : inCart > 0 ? (
            <Link to={`/s/${slug}/cart`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Check aria-hidden className="size-3.5" />
              In cart
            </Link>
          ) : (
            <Button size="sm" variant="secondary" loading={adding} onClick={onAdd}>
              <ShoppingCart aria-hidden className="size-3.5" />
              Add
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function CommanderSearchField({
  value,
  onChange,
  fetching,
  compact = false,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  fetching: boolean
  compact?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className={cx('w-full min-w-0', compact && 'lg:max-w-xl lg:flex-1')}>
      {!compact && (
        <p className="mb-2.5 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-fg-muted">
          Search commanders
        </p>
      )}
      <div className="relative">
        <Search
          aria-hidden
          className={cx(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-muted',
            compact ? 'left-3 size-4' : 'left-4 size-5',
          )}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={compact ? 'Change commander…' : 'Atraxa, Krenko, Korvold…'}
          className={cx(
            'w-full border border-border bg-surface text-fg shadow-sm placeholder:text-fg-muted',
            'focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
            compact
              ? 'h-10 rounded-[var(--radius-input)] pl-10 pr-3 text-sm'
              : 'h-14 rounded-full pl-12 pr-5 text-base font-medium',
          )}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Search commanders"
        />
      </div>
      {fetching && value.trim().length >= 2 && (
        <p className="mt-2 text-xs text-fg-muted">Searching catalog…</p>
      )}
    </div>
  )
}

export default function CommanderSynergyPage() {
  const { slug = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const { data: store, isLoading: storeLoading } = useStore(slug)
  useStoreTheme(store)
  useAppShellFlush(true)

  const [selected, setSelected] = useState<CommanderSummary | null>(() => {
    const commanderId = searchParams.get('commander')
    if (!commanderId) return null
    const stored = loadDeckBuilderSession(slug)
    if (stored?.commander.id === commanderId) return stored.commander
    return { id: commanderId, oracleId: '', name: '' }
  })
  const [strategyId, setStrategyId] = useState<string | null>(() => searchParams.get('strategy'))
  const [view, setView] = useState<'roles' | 'types'>(() => parseDeckBuilderView(searchParams.get('view')))
  /** inventory item id → oracle + item snapshot for checked cards */
  const [picked, setPicked] = useState<Map<number, { oracleId: string; item: InventoryItem }>>(
    () => new Map(),
  )
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDone, setBulkDone] = useState(false)
  const [panel, setPanel] = useState<'synergy' | 'combos' | 'deck'>(() =>
    parseDeckBuilderPanel(searchParams.get('panel')),
  )
  const [deckBusy, setDeckBusy] = useState(false)
  const [query, setQuery] = useState(() => selected?.name ?? '')
  const [budgetDollars, setBudgetDollars] = useState(() => searchParams.get('budget') ?? '')
  const [maxCardDollars, setMaxCardDollars] = useState(() => searchParams.get('maxCard') ?? '')
  const [bracket, setBracket] = useState(() => parseDeckBuilderBracket(searchParams.get('bracket')))
  const [includeOutOfStock, setIncludeOutOfStock] = useState(true)
  const debouncedBudgetDollars = useDebouncedValue(budgetDollars, 400)
  const debouncedMaxCardDollars = useDebouncedValue(maxCardDollars, 400)

  const budgetCents = dollarsToCents(debouncedBudgetDollars)
  const maxCardCents = dollarsToCents(debouncedMaxCardDollars)

  const search = useCommanderSearch(slug, query)
  const strategiesQuery = useCommanderStrategies(slug, selected?.id ?? null)
  const recommend = useCommanderRecommendations(slug, selected?.id ?? null, strategyId, true, {
    includeOutOfStock,
  })

  // Oracle ids for cards the shopper has already checked — drives adaptive
  // "what next?" re-ranking. Stored on the pick map so later next-cards pages
  // still know what was selected even after those rows leave the list.
  const pickedOracleIds = [...new Set([...picked.values()].map((entry) => entry.oracleId))].filter(
    Boolean,
  )

  const nextCards = useCommanderNextCards(
    slug,
    selected?.id ?? null,
    strategyId,
    pickedOracleIds,
    panel === 'synergy' && pickedOracleIds.length > 0,
    { includeOutOfStock },
  )
  const combos = useCommanderCombos(slug, selected?.id ?? null, panel === 'combos' || panel === 'deck')
  const deck = useCommanderDeck(slug, selected?.id ?? null, panel === 'deck', {
    // The strategy is what makes this an "Anim Pakal Tokens deck" rather than 99
    // popular cards in the right colors, so it has to reach the builder.
    strategy: strategyId,
    budgetCents,
    maxCardCents,
    bracket,
  })
  const cart = useCart(slug, signedIn)
  const cartLines = cart.query.data ?? []
  const packageData = nextCards.data ?? recommend.data
  const recommendations = packageData?.recommendations ?? []
  const byRole = packageData?.byRole
  const byType = packageData?.byType
  const intelLine = intelligenceSummary(packageData?.intelligence ?? deck.data?.intelligence)
  useEffect(() => {
    if (!selected) {
      setStrategyId(null)
      return
    }
    const list = strategiesQuery.data
    if (!list || list.length === 0) return
    setStrategyId((current) => {
      if (current && list.some((s) => s.id === current)) return current
      return list[0].id
    })
  }, [selected, strategiesQuery.data])

  useEffect(() => {
    const commander = recommend.data?.commander
    if (!commander || selected?.id !== commander.id) return
    if (selected.name === commander.name) return
    setSelected({
      id: commander.id,
      oracleId: commander.oracleId,
      name: commander.name,
      typeLine: commander.typeLine,
      manaCost: commander.manaCost,
      cmc: commander.cmc,
      colorIdentity: commander.colorIdentity,
      imageUrl: commander.imageUrl,
    })
    setQuery((current) => current || commander.name)
  }, [recommend.data?.commander, selected])

  useEffect(() => {
    const next = new URLSearchParams()
    if (selected?.id) {
      next.set('commander', selected.id)
      if (strategyId) next.set('strategy', strategyId)
      if (panel !== 'synergy') next.set('panel', panel)
      if (view !== 'roles') next.set('view', view)
      if (budgetDollars.trim()) next.set('budget', budgetDollars.trim())
      if (maxCardDollars.trim()) next.set('maxCard', maxCardDollars.trim())
      if (bracket !== 'auto') next.set('bracket', bracket)
    }
    if (next.toString() === searchParams.toString()) return
    setSearchParams(next, { replace: true })
  }, [bracket, budgetDollars, maxCardDollars, panel, searchParams, selected?.id, setSearchParams, strategyId, view])

  useEffect(() => {
    if (!slug) return
    if (!selected?.id || !selected.name) {
      if (!selected) saveDeckBuilderSession(slug, null)
      return
    }
    saveDeckBuilderSession(slug, {
      commander: selected,
      strategyId,
      panel,
      view,
      budgetDollars,
      maxCardDollars,
      bracket,
    })
  }, [bracket, budgetDollars, maxCardDollars, panel, selected, slug, strategyId, view])

  const cartQtyByInventoryId = new Map<number, number>()
  for (const line of cartLines) {
    if (line.inventoryItem?.id) {
      cartQtyByInventoryId.set(line.inventoryItem.id, line.quantity)
    }
  }

  // Only stocked cards are selectable; out-of-stock recommendations are shown
  // for deck-building value but there is nothing to put in a cart.
  const selectableIds = recommendations
    .map((row) => row.inventoryItem?.id)
    .filter((id): id is number => typeof id === 'number' && !cartQtyByInventoryId.has(id))

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => picked.has(id))

  function resetPicks() {
    setPicked(new Map())
    setBulkDone(false)
  }

  function handleQueryChange(next: string) {
    setQuery(next)
    if (selected && next.trim() !== selected.name) {
      setSelected(null)
      setStrategyId(null)
      resetPicks()
    }
  }

  function togglePick(id: number, oracleId: string, item: InventoryItem) {
    setPicked((current) => {
      const next = new Map(current)
      if (next.has(id)) next.delete(id)
      else next.set(id, { oracleId, item })
      return next
    })
    setBulkDone(false)
  }

  function toggleSelectAll() {
    setPicked((current) => {
      if (selectableIds.every((id) => current.has(id))) return new Map()
      const next = new Map(current)
      for (const row of recommendations) {
        const item = row.inventoryItem
        if (!item || cartQtyByInventoryId.has(item.id)) continue
        next.set(item.id, { oracleId: row.card.oracleId, item })
      }
      return next
    })
    setBulkDone(false)
  }

  async function addOne(item: InventoryItem) {
    if (!signedIn) return
    const inCart = cartQtyByInventoryId.get(item.id) ?? 0
    await cart.setItem.mutateAsync({ item, quantity: Math.min(item.quantity, inCart + 1) })
  }

  async function addSelectedEnMasse() {
    if (!signedIn || picked.size === 0) return
    setBulkBusy(true)
    setBulkDone(false)
    try {
      for (const { item } of picked.values()) {
        if (cartQtyByInventoryId.has(item.id)) continue
        const inCart = cartQtyByInventoryId.get(item.id) ?? 0
        const take = Math.min(item.quantity, Math.max(1, inCart + 1))
        await cart.setItem.mutateAsync({ item, quantity: take })
      }
      setPicked(new Map())
      setBulkDone(true)
    } finally {
      setBulkBusy(false)
    }
  }

  async function addDeckToCart() {
    if (!signedIn || !deck.data?.cards.length) return
    setDeckBusy(true)
    try {
      for (const row of deck.data.cards) {
        const item = row.inventoryItem
        // Skip cards the deck wants but the store does not carry.
        if (!item || cartQtyByInventoryId.has(item.id)) continue
        await cart.setItem.mutateAsync({ item, quantity: Math.min(1, item.quantity) })
      }
      setBulkDone(true)
    } finally {
      setDeckBusy(false)
    }
  }

  if (storeLoading || !store) {
    return <StorePageLoader />
  }

  const searchResults = search.data ?? []
  const showSearchGrid = !selected && query.trim().length >= 2

  function pickCommander(commander: CommanderSummary) {
    setSelected(commander)
    setStrategyId(null)
    resetPicks()
    setPanel('synergy')
    setQuery(commander.name)
  }

  function clearCommander() {
    setSelected(null)
    setStrategyId(null)
    resetPicks()
    setQuery('')
    saveDeckBuilderSession(slug, null)
  }

  const cardLinkState: DeckBuilderNavState | undefined = selected
    ? {
        from: 'deck-builder',
        commanderId: selected.id,
        strategy: strategyId,
        panel,
        view,
      }
    : undefined

  function renderRows(rows: CommanderRecommendation[]) {
    return (
      <ul className="space-y-2">
        {rows.map((row) => {
          const item = row.inventoryItem
          const inCart = item ? (cartQtyByInventoryId.get(item.id) ?? 0) : 0
          return (
            <RecRow
              // Oracle id keys the row so a stocked and an unstocked card are
              // both addressable; inventory ids only exist for the former.
              key={row.card.oracleId}
              row={row}
              slug={slug}
              signedIn={signedIn}
              inCart={inCart}
              checked={item ? picked.has(item.id) : false}
              disabledPick={inCart > 0}
              adding={cart.setItem.isPending}
              onToggle={() => item && togglePick(item.id, row.card.oracleId, item)}
              onAdd={() => item && void addOne(item)}
              linkState={cardLinkState}
            />
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col">
      {selected ? (
        <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BackButton to={`/s/${slug}`}>Back</BackButton>
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-brand-600">
                  Deck builder
                </p>
                <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-fg">
                  {selected.name}
                </h1>
              </div>
            </div>
            <CommanderSearchField
              value={query}
              onChange={handleQueryChange}
              fetching={search.isFetching}
              compact
            />
          </div>
        </header>
      ) : (
        <div className="relative mx-auto w-full max-w-5xl px-6 pt-4 sm:px-8 sm:pt-6 lg:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-brand-500)_18%,transparent),transparent_62%)]"
          />
          <header className="relative">
            <BackButton to={`/s/${slug}`}>Back to store</BackButton>
            <p className="mt-8 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-brand-600">
              <Crown aria-hidden className="size-3.5" />
              Commander
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
              Deck Builder
            </h1>
            <p className="mt-3 max-w-lg text-base leading-7 text-fg-muted">
              Search a legal commander, pick a strategy, then add this store&apos;s in-stock cards
              grouped by role or type.
            </p>
            <div className="mt-8">
              <CommanderSearchField
                value={query}
                onChange={handleQueryChange}
                fetching={search.isFetching}
                autoFocus
              />
            </div>
          </header>
        </div>
      )}

      <section
        className={cx(
          'flex flex-1 flex-col',
          selected
            ? 'gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:flex-row xl:items-start'
            : 'mx-auto w-full max-w-5xl px-6 pb-16 pt-10 sm:px-8 lg:px-10',
        )}
      >
        {showSearchGrid ? (
          <div className="w-full min-w-0">
            {searchResults.length === 0 && !search.isFetching ? (
              <EmptyState
                icon={Search}
                title="No commanders matched"
                description="Try a different spelling or a shorter name fragment."
              />
            ) : searchResults.length === 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex gap-3 rounded-card border border-border bg-surface p-3">
                    <Skeleton className="h-20 w-14 shrink-0 rounded-md" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((commander) => (
                  <li key={commander.id}>
                    <button
                      type="button"
                      onClick={() => pickCommander(commander)}
                      className="flex h-full w-full gap-3 rounded-card border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50/40"
                    >
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-bg">
                        {commander.imageUrl ? (
                          <img
                            src={commander.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <CardImage src={null} alt={commander.name} className="h-full w-full" showLabel={false} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 self-center">
                        <p className="font-display text-sm font-extrabold leading-snug text-fg">
                          {commander.name}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{commander.typeLine}</p>
                        <div className="mt-2">{colorPips(commander.colorIdentity)}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : !selected ? (
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { step: '01', title: 'Find a commander', body: 'Search the full legal catalog, not just what is on the shelf.' },
              { step: '02', title: 'Pick a strategy', body: 'We detect the builds that commander actually supports.' },
              { step: '03', title: 'Fill from stock', body: 'Add enablers, fuel, and payoffs that this store has in stock.' },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-card border border-border/80 bg-surface/80 px-6 py-7 dark:glass-card"
              >
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-brand-600">
                  {item.step}
                </p>
                <p className="mt-3 font-display text-lg font-extrabold leading-snug text-fg">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{item.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <aside
              className={cx(
                'w-full shrink-0 space-y-4',
                // Sticky left rail on wide screens: cap height to the viewport so
                // long strategy lists stay reachable instead of clipping under the fold.
                'xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:w-[22rem] xl:self-start',
                'xl:overflow-y-auto xl:overscroll-y-contain',
              )}
            >
              <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm dark:glass-card">
                <div className="flex gap-4 p-4">
                  <div className="w-24 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-28">
                    <CardImage
                      src={selected.imageUrl}
                      alt={selected.name}
                      className="aspect-5/7 w-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-lg font-extrabold leading-snug text-fg">
                      {selected.name}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">{selected.typeLine}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {colorPips(selected.colorIdentity)}
                      {recommend.data?.identityCode && (
                        <Badge tone="neutral">{recommend.data.identityCode}</Badge>
                      )}
                    </div>
                    {recommend.data?.commander.themes && recommend.data.commander.themes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {recommend.data.commander.themes.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] font-semibold capitalize text-brand-700"
                          >
                            {tag.replaceAll('_', ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="mt-3 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-500"
                      onClick={clearCommander}
                    >
                      Change commander
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
                  Strategy
                </p>
                {strategiesQuery.isLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                )}
                <div className="space-y-2">
                  {(strategiesQuery.data ?? []).map((strategy) => {
                    const active = strategyId === strategy.id
                    const confidence = Math.round(strategy.confidence * 100)
                    const deckCount = strategy.deckCount ?? strategy.sampleSize ?? 0
                    return (
                      <button
                        key={strategy.id}
                        type="button"
                        onClick={() => {
                          setStrategyId(strategy.id)
                          resetPicks()
                        }}
                        className={cx(
                          'w-full rounded-card border px-3.5 py-3 text-left transition-all duration-200',
                          active
                            ? 'border-brand-400 bg-brand-50/70 shadow-sm dark:bg-brand-500/12'
                            : 'border-border bg-surface hover:border-brand-300/70',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-fg">{strategy.label}</p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {deckCount > 0 && (
                              <span className="rounded-full bg-bg px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums text-fg-muted">
                                {deckCount} deck{deckCount === 1 ? '' : 's'}
                              </span>
                            )}
                            {active ? (
                              <CheckCircle2 aria-hidden className="size-4 text-brand-600" />
                            ) : (
                              <span className="text-[0.65rem] font-bold tabular-nums text-fg-muted">
                                {confidence}%
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{strategy.description}</p>
                        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-bg">
                          <div
                            className={cx(
                              'h-full rounded-full transition-all duration-500',
                              active ? 'bg-brand-500' : 'bg-fg-muted/35',
                            )}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-card border border-border bg-surface p-4 shadow-sm">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
                  Build constraints
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                  Caps apply to the 100-card list. Combos stay legal in this commander&apos;s
                  colors.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-border text-brand-600 focus:ring-brand-500"
                    checked={includeOutOfStock}
                    onChange={(e) => {
                      setIncludeOutOfStock(e.target.checked)
                      resetPicks()
                    }}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-fg">Include out of stock</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                      Still recommend cards this store does not carry — flagged, not buyable.
                    </span>
                  </span>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Input
                    label="Deck budget"
                    inputMode="decimal"
                    placeholder="500"
                    value={budgetDollars}
                    onChange={(e) => setBudgetDollars(e.target.value)}
                    hint="USD total"
                  />
                  <Input
                    label="Card max"
                    inputMode="decimal"
                    placeholder="25"
                    value={maxCardDollars}
                    onChange={(e) => setMaxCardDollars(e.target.value)}
                    hint="USD each"
                  />
                </div>
                <Select
                  label="Commander bracket"
                  wrapperClassName="mt-3"
                  value={bracket}
                  onChange={(e) => setBracket(parseDeckBuilderBracket(e.target.value))}
                  hint="Auto uses Scryfall Game Changers this store stocks in-identity."
                >
                  <option value="auto">Auto from store stock</option>
                  <option value="1">1 · Exhibition (no Game Changers)</option>
                  <option value="2">2 · Core (no Game Changers)</option>
                  <option value="3">3 · Upgraded (up to 3 Game Changers)</option>
                  <option value="4">4 · Optimized</option>
                  <option value="5">5 · cEDH</option>
                </Select>
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <Tabs
                aria-label="Deck builder views"
                value={panel}
                onChange={(id) => setPanel(id as typeof panel)}
                tabs={[
                  { id: 'synergy', label: 'Synergies', icon: Sparkles },
                  { id: 'combos', label: 'Combos', icon: Wand2 },
                  { id: 'deck', label: '100-card deck', icon: Layers },
                ]}
              />

              <TabPanel when="synergy" value={panel} className="pt-5">
                {!strategyId || strategiesQuery.isLoading ? (
                  <LoadingPanel label="Reading this commander's strategies…" />
                ) : recommend.isLoading ? (
                  <LoadingPanel label="Building your in-stock package…" />
                ) : recommendations.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title="No package yet"
                    description={
                      includeOutOfStock
                        ? 'This store does not currently stock enough cards for that strategy. Try another strategy, or ask the store to sync more Magic inventory.'
                        : 'No in-stock cards matched. Turn on “Include out of stock” to see the full strategy package.'
                    }
                  />
                ) : (
                  <>
                    <div className="sticky top-[4.25rem] z-10 mb-5 rounded-card border border-border/80 bg-surface/90 p-3 shadow-sm backdrop-blur-md">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-display text-base font-extrabold text-fg">
                            {packageData?.strategy.label}
                            <span className="ml-2 text-sm font-semibold text-fg-muted">
                              {recommendations.filter((r) => r.inventoryItem).length} in stock
                              {!includeOutOfStock ? '' : ` · ${recommendations.length} total`}
                            </span>
                          </p>
                          <p className="text-xs text-fg-muted">
                            {packageData?.totalCandidates ?? recommendations.length} color-legal
                            candidates
                            {pickedOracleIds.length > 0
                              ? ` · re-ranked for ${pickedOracleIds.length} pick${pickedOracleIds.length === 1 ? '' : 's'}`
                              : ''}
                            {nextCards.isFetching ? ' · updating…' : ''}
                          </p>
                          {intelLine && (
                            <p className="mt-1 text-[0.7rem] font-medium text-fg-muted">{intelLine}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex rounded-btn border border-border bg-bg p-0.5">
                            <button
                              type="button"
                              onClick={() => setView('roles')}
                              className={cx(
                                'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
                                view === 'roles' ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
                              )}
                            >
                              By role
                            </button>
                            <button
                              type="button"
                              onClick={() => setView('types')}
                              className={cx(
                                'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
                                view === 'types' ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
                              )}
                            >
                              By type
                            </button>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={toggleSelectAll}>
                            {allSelected ? 'Clear' : 'Select all'}
                          </Button>
                          {!signedIn ? (
                            <Link to="/login" className={buttonVariants({ size: 'sm' })}>
                              Sign in to add
                            </Link>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              loading={bulkBusy}
                              disabled={bulkBusy || picked.size === 0}
                              onClick={() => void addSelectedEnMasse()}
                            >
                              <ShoppingCart aria-hidden className="size-4" />
                              Add{picked.size > 0 ? ` ${picked.size}` : ''} to cart
                            </Button>
                          )}
                          {signedIn && (
                            <Link
                              to={`/s/${slug}/cart`}
                              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                            >
                              Cart
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {bulkDone && (
                      <p className="mb-4 flex items-center gap-1.5 text-sm font-medium text-success-700">
                        <Check aria-hidden className="size-4" />
                        Selected cards added to your cart.
                      </p>
                    )}

                    {view === 'roles' && byRole && (
                      <div className="space-y-8">
                        {(['enabler', 'fuel', 'payoff', 'support'] as DeckRole[]).map((role) => {
                          const rows = byRole[role] ?? []
                          if (rows.length === 0) return null
                          const meta = ROLE_META[role]
                          const Icon = meta.icon
                          return (
                            <section key={role}>
                              <div className="mb-3 flex items-center gap-3">
                                <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand-700">
                                  <Icon aria-hidden className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-2">
                                    <h2 className="font-display text-lg font-extrabold text-fg">
                                      {meta.label}
                                    </h2>
                                    <span className="text-xs font-semibold text-fg-muted">
                                      {rows.length}
                                    </span>
                                  </div>
                                  <p className="text-xs text-fg-muted">{meta.blurb}</p>
                                </div>
                              </div>
                              {renderRows(rows)}
                            </section>
                          )
                        })}
                      </div>
                    )}

                    {view === 'types' && byType && (
                      <div className="space-y-8">
                        {TYPE_ORDER.map((type) => {
                          const rows = byType[type] ?? []
                          if (rows.length === 0) return null
                          return (
                            <section key={type}>
                              <h2 className="mb-3 font-display text-lg font-extrabold text-fg">
                                {TYPE_LABELS[type]}
                                <span className="ml-2 text-sm font-semibold text-fg-muted">
                                  {rows.length}
                                </span>
                              </h2>
                              {renderRows(rows)}
                            </section>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </TabPanel>

              <TabPanel when="combos" value={panel} className="pt-5">
                <CombosPanel
                  slug={slug}
                  loading={combos.isLoading}
                  combos={combos.data?.combos ?? []}
                  identityCode={combos.data?.identityCode ?? recommend.data?.identityCode}
                  colorIdentity={combos.data?.colorIdentity ?? selected.colorIdentity}
                  filteredOutCount={combos.data?.filteredOutCount ?? 0}
                  signedIn={signedIn}
                  cartQtyByInventoryId={cartQtyByInventoryId}
                  onAdd={(item) => void addOne(item)}
                  cartPending={cart.setItem.isPending}
                  linkState={cardLinkState}
                />
              </TabPanel>

              <TabPanel when="deck" value={panel} className="pt-5">
                <DeckPanel
                  slug={slug}
                  loading={deck.isLoading}
                  deck={deck.data}
                  signedIn={signedIn}
                  busy={deckBusy}
                  onAddAll={() => void addDeckToCart()}
                  linkState={cardLinkState}
                />
              </TabPanel>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function CombosPanel({
  slug,
  loading,
  combos,
  identityCode,
  colorIdentity,
  filteredOutCount,
  signedIn,
  cartQtyByInventoryId,
  onAdd,
  cartPending,
  linkState,
}: {
  slug: string
  loading: boolean
  combos: SpellbookCombo[]
  identityCode?: string
  colorIdentity?: string[]
  filteredOutCount?: number
  signedIn: boolean
  cartQtyByInventoryId: Map<number, number>
  onAdd: (item: InventoryItem) => void
  cartPending: boolean
  linkState?: DeckBuilderNavState
}) {
  if (loading) {
    return <LoadingPanel label="Checking Commander Spellbook against store stock…" />
  }
  if (combos.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="No combos found yet"
        description="Commander Spellbook did not return combos legal in this commander’s color identity, or the store has none of the pieces in stock."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border bg-surface px-4 py-3 text-sm">
        <p className="font-semibold text-fg">
          Legal in {identityCode || 'this identity'}
          <span className="ml-2 inline-flex align-middle">{colorPips(colorIdentity)}</span>
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Only pieces this store actually has on the shelf count as in stock (any printing of the
          same card). Colorless cards are always allowed. Combos are ranked complete-in-store first,
          then by coverage.
          {filteredOutCount ? ` Hidden ${filteredOutCount} off-identity combo${filteredOutCount === 1 ? '' : 's'}.` : ''}
        </p>
      </div>
    <ul className="space-y-3">
      {combos.map((combo) => (
        <li key={combo.id || combo.description} className="rounded-card border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-fg">
                {combo.inStockCount} of {combo.cards.length} pieces in stock here
                {combo.completeInStore ? ' · all available here' : ''}
              </p>
              {combo.produces.length > 0 && (
                <p className="mt-1 text-xs text-fg-muted">{combo.produces.slice(0, 3).join(' · ')}</p>
              )}
            </div>
            {combo.completeInStore && <Badge tone="success">Buyable here</Badge>}
          </div>
          {combo.description && (
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{combo.description}</p>
          )}
          <ul className="mt-3 space-y-1.5">
            {combo.cards.map((piece) => (
              <li
                key={`${combo.id}-${piece.name}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm"
              >
                <span className={piece.inStock ? 'font-medium text-fg' : 'text-fg-muted'}>
                  {piece.name}
                  {piece.isCommander && !piece.inStock ? ' · commander (not in stock here)' : ''}
                  {piece.isCommander && piece.inStock ? ' · commander' : ''}
                  {!piece.inStock && !piece.isCommander && ' · missing here'}
                  {piece.inStock && piece.stockQuantity != null && piece.stockQuantity > piece.quantity
                    ? ` · ${piece.stockQuantity} available`
                    : ''}
                </span>
                {piece.inventoryItem && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">
                      {formatPrice(piece.inventoryItem.priceCents)}
                    </span>
                    {signedIn && !cartQtyByInventoryId.has(piece.inventoryItem.id) ? (
                      <Button size="sm" variant="secondary" loading={cartPending} onClick={() => onAdd(piece.inventoryItem!)}>
                        Add
                      </Button>
                    ) : piece.inventoryItem ? (
                      <Link
                        to={`/s/${slug}/cards/${piece.inventoryItem.id}`}
                        state={linkState}
                        className="text-xs font-semibold text-brand-600"
                      >
                        View
                      </Link>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {combo.missing.length > 0 && (
            <p className="mt-2 text-xs text-fg-muted">
              Missing: {combo.missing.slice(0, 6).join(', ')}
              {combo.missing.length > 6 ? '…' : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
    </div>
  )
}

function DeckPanel({
  slug,
  loading,
  deck,
  signedIn,
  busy,
  onAddAll,
  linkState,
}: {
  slug: string
  loading: boolean
  deck: import('../hooks').AssembledDeckResponse | undefined
  signedIn: boolean
  busy: boolean
  onAddAll: () => void
  linkState?: DeckBuilderNavState
}) {
  if (loading || !deck) {
    return <LoadingPanel label="Assembling a deck from store inventory…" />
  }

  const slotEntries = Object.entries(deck.slots).filter(([key]) => key !== 'commander')
  const structure = deck.structure?.actual ?? {}
  const targets = deck.structure?.targets ?? {}
  const inStockCount = deck.cards.filter((row) => row.inventoryItem).length
  const intelLine = intelligenceSummary(deck.intelligence)

  const structureLine = (['lands', 'ramp', 'draw', 'removal'] as const)
    .map((role) => `${role} ${structure[role] ?? 0}/${targets[role] ?? 0}`)
    .join(' · ')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base font-extrabold text-fg">
            {deck.filledSize} / {deck.targetSize} cards · {deck.strategy.label}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {deck.bracket.label} (bracket {deck.bracket.applied}
            {deck.bracket.auto ? ', auto' : ''})
            {deck.budget.limitCents != null
              ? ` · ${formatPrice(deck.budget.spentCents)} of ${formatPrice(deck.budget.limitCents)}`
              : ` · ${formatPrice(deck.budget.spentCents)}`}
            {deck.budget.maxCardCents != null ? ` · max ${formatPrice(deck.budget.maxCardCents)} / card` : ''}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {structureLine} · avg MV {deck.averageManaValue}
            {(deck.slots.game_changer ?? 0) > 0 ? ` · Game Changers ${deck.slots.game_changer}` : ''}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {inStockCount} of {deck.cards.length} available here · built from{' '}
            {deck.intelligence.source}
          </p>
          {intelLine && (
            <p className="mt-1 text-[0.7rem] font-medium text-fg-muted">{intelLine}</p>
          )}
          {deck.bracket.gameChangersInStock.length > 0 && (
            <p className="mt-1 text-xs text-fg-muted">
              Store can supply {deck.bracket.gameChangersInStock.length} Game Changer
              {deck.bracket.gameChangersInStock.length === 1 ? '' : 's'} in this identity
              {deck.bracket.gameChangersIncluded.length > 0
                ? ` · included ${deck.bracket.gameChangersIncluded.map((c) => c.name).join(', ')}`
                : ''}
            </p>
          )}
          {deck.gaps.length > 0 && (
            <p className="mt-1 text-xs text-warning-700">{deck.gaps[0]}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!signedIn ? (
            <Link to="/login" className={buttonVariants({ size: 'sm' })}>
              Sign in to add deck
            </Link>
          ) : (
            <Button size="sm" loading={busy} disabled={busy || deck.cards.length === 0} onClick={onAddAll}>
              <ShoppingCart aria-hidden className="size-4" />
              Add available to cart
            </Button>
          )}
          <Link to={`/s/${slug}/cart`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Cart
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {slotEntries.map(([slot, count]) => (
          <Badge key={slot} tone="neutral">
            {slot}: {count}
          </Badge>
        ))}
      </div>

      {deck.combos.length > 0 && (
        <p className="text-xs text-fg-muted">
          {deck.combos.filter((c) => c.completeInStore).length} complete combos in this list ·{' '}
          {deck.combos.length} total Spellbook hits
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {deck.cards.map((row) => {
          const item = row.inventoryItem
          const name = item?.card.name ?? row.card.name
          const image = cardImage(item?.card ?? row.card)
          const detailPath = item ? `/s/${slug}/cards/${item.id}` : null
          const meta = [
            row.quantity > 1 ? `${row.quantity}×` : null,
            row.slot.replaceAll('_', ' '),
            row.gameChanger ? 'game changer' : null,
            item ? formatPrice(item.priceCents) : 'not stocked',
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <li
              key={row.card.oracleId}
              className={cx(
                'flex gap-2 rounded-card border border-border bg-surface p-2',
                !item && 'opacity-70',
              )}
              title={row.reasons?.slice(0, 3).join(' · ')}
            >
              {detailPath ? (
                <Link to={detailPath} state={linkState} className="w-12 shrink-0 overflow-hidden rounded-md">
                  <CardImage src={image} alt={name} className="aspect-5/7 w-full" />
                </Link>
              ) : (
                <div className="w-12 shrink-0 overflow-hidden rounded-md">
                  <CardImage src={image} alt={name} className="aspect-5/7 w-full" />
                </div>
              )}
              <div className="min-w-0 self-center">
                {detailPath ? (
                  <Link
                    to={detailPath}
                    state={linkState}
                    className="block truncate text-sm font-semibold text-fg hover:text-brand-600"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-semibold text-fg">{name}</span>
                )}
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-muted">
                  {meta}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
