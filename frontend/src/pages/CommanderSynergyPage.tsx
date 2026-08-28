import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  Check,
  CheckCircle2,
  ChevronDown,
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
  PUBLIC_RECOMMEND_SCOPE,
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
import { AnimatePresence, EASE_PREMIUM, motion } from '../components/motion'
import {
  CardArtLightbox,
  CardImage,
  cardArtButtonClassName,
  previewFromRecommendation,
  previewFromDeckRow,
  type CardArtPreview,
} from '../components/cards'
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
  PUBLIC_DECK_BUILDER_SCOPE,
  type DeckBuilderNavState,
} from '../lib/deckBuilder'
import { usePageMeta, useJsonLd } from '../hooks/usePageMeta'
import { ShareButton } from '../components/ShareButton'

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

function publicRecommendationReasons(reasons: string[]): string[] {
  return reasons.filter(
    (reason) => !reason.startsWith('Appears in') && !reason.includes('reference deck'),
  )
}

type DeckBracket = ReturnType<typeof parseDeckBuilderBracket>

function DeckBuildConstraintsFields({
  budgetDollars,
  setBudgetDollars,
  maxCardDollars,
  setMaxCardDollars,
  bracket,
  setBracket,
  includeOutOfStock,
  setIncludeOutOfStock,
  showOutOfStockToggle,
  onOutOfStockChange,
  publicMode = false,
}: {
  budgetDollars: string
  setBudgetDollars: Dispatch<SetStateAction<string>>
  maxCardDollars: string
  setMaxCardDollars: Dispatch<SetStateAction<string>>
  bracket: DeckBracket
  setBracket: Dispatch<SetStateAction<DeckBracket>>
  includeOutOfStock: boolean
  setIncludeOutOfStock: Dispatch<SetStateAction<boolean>>
  showOutOfStockToggle: boolean
  onOutOfStockChange?: () => void
  publicMode?: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-fg-muted">
        Caps apply to the 100-card list. Combos stay legal in this commander&apos;s colors.
      </p>
      {showOutOfStockToggle && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-border text-brand-600 focus:ring-brand-500"
            checked={includeOutOfStock}
            onChange={(e) => {
              setIncludeOutOfStock(e.target.checked)
              onOutOfStockChange?.()
            }}
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Include out of stock</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
              Still recommend cards this store does not carry — flagged, not buyable.
            </span>
          </span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
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
        value={bracket}
        onChange={(e) => setBracket(parseDeckBuilderBracket(e.target.value))}
        hint={
          publicMode
            ? 'Auto picks a bracket from the full catalog.'
            : 'Auto uses Scryfall Game Changers this store stocks in-identity.'
        }
      >
        <option value="auto">{publicMode ? 'Auto' : 'Auto from store stock'}</option>
        <option value="1">1 · Exhibition (no Game Changers)</option>
        <option value="2">2 · Core (no Game Changers)</option>
        <option value="3">3 · Upgraded (up to 3 Game Changers)</option>
        <option value="4">4 · Optimized</option>
        <option value="5">5 · cEDH</option>
      </Select>
    </div>
  )
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
  publicMode = false,
  onPreview,
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
  publicMode?: boolean
  onPreview?: () => void
  onToggle: () => void
  onAdd: () => void
}) {
  const item = row.inventoryItem
  const match = Math.round(row.score * 100)
  const roleLabel = ROLE_META[row.role]?.label ?? row.role
  const name = item?.card.name ?? row.card.name
  const typeLine = item?.card.typeLine ?? row.card.typeLine
  const image = cardImage(item?.card ?? row.card)
  const detailPath = item && !publicMode ? `/s/${slug}/cards/${item.id}` : null
  const visibleReasons = publicMode ? publicRecommendationReasons(row.reasons) : row.reasons

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

  const cardThumb = (
    <CardImage src={image} alt={name} className="aspect-5/7 w-full" />
  )

  const imageCell = onPreview ? (
    <button
      type="button"
      onClick={onPreview}
      className={cardArtButtonClassName(true)}
      aria-label={`View ${name}`}
    >
      {cardThumb}
    </button>
  ) : detailPath ? (
    <Link
      to={detailPath}
      state={linkState}
      className="w-12 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-14"
    >
      {cardThumb}
    </Link>
  ) : (
    <div className="w-12 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-14">{cardThumb}</div>
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
          disabled={disabledPick || (!publicMode && !item)}
          onChange={onToggle}
          aria-label={`Select ${name}`}
        />
      </label>
      {imageCell}
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
            ) : publicMode ? (
              ' · Magic catalog'
            ) : (
              ' · not in stock here'
            )}
          </p>
          {visibleReasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {visibleReasons.slice(0, 3).map((reason) => (
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
        <div
          className={cx(
            'mt-3 flex items-center gap-3 sm:mt-0',
            publicMode ? 'sm:justify-end' : 'justify-between sm:flex-col sm:items-end sm:justify-center',
          )}
        >
          <div className={publicMode ? 'text-right' : 'text-right'}>
            {!publicMode && (
              <p className="font-display text-base font-extrabold tracking-tight text-fg">
                {item ? formatPrice(item.priceCents) : '—'}
              </p>
            )}
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-muted">
              {roleLabel} · {match}% match
            </p>
          </div>
          {!publicMode && (
            <>
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
            </>
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

export default function CommanderSynergyPage({ variant = 'store' }: { variant?: 'store' | 'public' }) {
  const isPublic = variant === 'public'
  const { slug: routeSlug = '' } = useParams()
  const apiScope = isPublic ? PUBLIC_RECOMMEND_SCOPE : routeSlug
  const sessionScope = isPublic ? PUBLIC_DECK_BUILDER_SCOPE : routeSlug
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const signedIn = Boolean(user)

  usePageMeta({
    title: isPublic ? 'Commander Deck Builder' : 'Deck Builder',
    description: isPublic
      ? 'Build a 100-card Commander deck with strategy-aware recommendations, Spellbook combos, and mana-curve analysis.'
      : 'Search commanders, pick a strategy, and fill your deck from this store\'s in-stock singles.',
    path: isPublic ? '/tools/deck-builder' : `/s/${routeSlug}/deck-builder`,
  })

  useJsonLd(
    'deck-builder-faq',
    isPublic
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'Is the Commander deck builder free?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. The public deck builder on LGS Card Vault is free and does not require a store account.',
              },
            },
            {
              '@type': 'Question',
              name: 'Does it work without a local game store?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Recommendations come from the full Magic catalog. Visit a store on LGS Card Vault when you are ready to buy cards.',
              },
            },
          ],
        }
      : {},
  )

  const { data: store, isLoading: storeLoading } = useStore(isPublic ? undefined : routeSlug)
  useStoreTheme(isPublic ? undefined : store)
  useAppShellFlush(true)

  const [selected, setSelected] = useState<CommanderSummary | null>(() => {
    const commanderId = searchParams.get('commander')
    if (!commanderId) return null
    const stored = loadDeckBuilderSession(sessionScope)
    if (stored?.commander.id === commanderId) return stored.commander
    return { id: commanderId, oracleId: '', name: '' }
  })
  const [strategyId, setStrategyId] = useState<string | null>(() => searchParams.get('strategy'))
  const [view, setView] = useState<'roles' | 'types'>(() => parseDeckBuilderView(searchParams.get('view')))
  /** inventory item id → oracle + item snapshot for checked cards */
  const [picked, setPicked] = useState<Map<string, { oracleId: string; item: InventoryItem | null }>>(
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
  const [constraintsOpen, setConstraintsOpen] = useState(false)
  const [deckConstraintsOpen, setDeckConstraintsOpen] = useState(false)
  const [strategiesOpen, setStrategiesOpen] = useState(true)
  const [cardPreview, setCardPreview] = useState<{ cards: CardArtPreview[]; index: number } | null>(null)
  const debouncedBudgetDollars = useDebouncedValue(budgetDollars, 400)
  const debouncedMaxCardDollars = useDebouncedValue(maxCardDollars, 400)

  const budgetCents = dollarsToCents(debouncedBudgetDollars)
  const maxCardCents = dollarsToCents(debouncedMaxCardDollars)

  const search = useCommanderSearch(apiScope, query)
  const strategiesQuery = useCommanderStrategies(apiScope, selected?.id ?? null)
  const recommend = useCommanderRecommendations(apiScope, selected?.id ?? null, strategyId, true, {
    includeOutOfStock: isPublic ? true : includeOutOfStock,
  })

  // Oracle ids for cards the shopper has already checked — drives adaptive
  // "what next?" re-ranking. Stored on the pick map so later next-cards pages
  // still know what was selected even after those rows leave the list.
  const pickedOracleIds = [...new Set([...picked.values()].map((entry) => entry.oracleId))].filter(
    Boolean,
  )

  const nextCards = useCommanderNextCards(
    apiScope,
    selected?.id ?? null,
    strategyId,
    pickedOracleIds,
    panel === 'synergy' && pickedOracleIds.length > 0,
    { includeOutOfStock: isPublic ? true : includeOutOfStock },
  )
  const combos = useCommanderCombos(apiScope, selected?.id ?? null, panel === 'combos' || panel === 'deck')
  const deck = useCommanderDeck(apiScope, selected?.id ?? null, panel === 'deck', {
    // The strategy is what makes this an "Anim Pakal Tokens deck" rather than 99
    // popular cards in the right colors, so it has to reach the builder.
    strategy: strategyId,
    budgetCents,
    maxCardCents,
    bracket,
  })
  const cart = useCart(isPublic ? '' : routeSlug, signedIn && !isPublic)
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
    if (!sessionScope) return
    if (!selected?.id || !selected.name) {
      if (!selected) saveDeckBuilderSession(sessionScope, null)
      return
    }
    saveDeckBuilderSession(sessionScope, {
      commander: selected,
      strategyId,
      panel,
      view,
      budgetDollars,
      maxCardDollars,
      bracket,
    })
  }, [bracket, budgetDollars, maxCardDollars, panel, selected, sessionScope, strategyId, view])

  const cartQtyByInventoryId = new Map<number, number>()
  for (const line of cartLines) {
    if (line.inventoryItem?.id) {
      cartQtyByInventoryId.set(line.inventoryItem.id, line.quantity)
    }
  }

  const selectableOracleIds = recommendations
    .filter((row) => {
      if (isPublic) return true
      const item = row.inventoryItem
      return Boolean(item && !cartQtyByInventoryId.has(item.id))
    })
    .map((row) => row.card.oracleId)

  const allSelected = selectableOracleIds.length > 0 && selectableOracleIds.every((id) => picked.has(id))

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

  function togglePick(oracleId: string, item: InventoryItem | null) {
    setPicked((current) => {
      const next = new Map(current)
      if (next.has(oracleId)) next.delete(oracleId)
      else next.set(oracleId, { oracleId, item })
      return next
    })
    setBulkDone(false)
  }

  function toggleSelectAll() {
    setPicked((current) => {
      if (selectableOracleIds.every((id) => current.has(id))) return new Map()
      const next = new Map(current)
      for (const row of recommendations) {
        const item = row.inventoryItem
        if (!isPublic && (!item || cartQtyByInventoryId.has(item.id))) continue
        next.set(row.card.oracleId, { oracleId: row.card.oracleId, item })
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
    if (isPublic || !signedIn || picked.size === 0) return
    setBulkBusy(true)
    setBulkDone(false)
    try {
      for (const { item } of picked.values()) {
        if (!item || cartQtyByInventoryId.has(item.id)) continue
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
    if (isPublic || !signedIn || !deck.data?.cards.length) return
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

  if (!isPublic && (storeLoading || !store)) {
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
    setConstraintsOpen(false)
    setStrategiesOpen(true)
    resetPicks()
    setQuery('')
    saveDeckBuilderSession(sessionScope, null)
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

  function openCardPreview(cards: CardArtPreview[], oracleId: string) {
    const index = cards.findIndex((card) => card.oracleId === oracleId)
    if (index < 0) return
    setCardPreview({ cards, index })
  }

  function renderRows(rows: CommanderRecommendation[]) {
    const previewCards = rows.map((row) => previewFromRecommendation(row))
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
              slug={routeSlug}
              signedIn={signedIn}
              inCart={inCart}
              checked={picked.has(row.card.oracleId)}
              disabledPick={!isPublic && inCart > 0}
              adding={cart.setItem.isPending}
              publicMode={isPublic}
              onPreview={
                isPublic
                  ? () => openCardPreview(previewCards, row.card.oracleId)
                  : undefined
              }
              onToggle={() => togglePick(row.card.oracleId, item)}
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
              <BackButton to={isPublic ? '/' : `/s/${routeSlug}`}>
                {isPublic ? 'Home' : 'Back'}
              </BackButton>
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
            <BackButton to={isPublic ? '/' : `/s/${routeSlug}`}>
              {isPublic ? 'Home' : 'Back to store'}
            </BackButton>
            <p className="mt-8 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-brand-600">
              <Crown aria-hidden className="size-3.5" />
              Commander
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
              {isPublic ? 'Commander Deck Builder' : 'Deck Builder'}
            </h1>
            {!isPublic && (
              <p className="mt-3 max-w-lg text-base leading-7 text-fg-muted">
                Search a legal commander, pick a strategy, then add this store&apos;s in-stock cards
                grouped by role or type.
              </p>
            )}
            {isPublic && (
              <p className="mt-2 text-sm text-fg-muted">
                Want to buy cards too?{' '}
                <Link to="/stores" className="font-semibold text-brand-600 hover:text-brand-500">
                  Browse local game stores
                </Link>
                .
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {isPublic && (
                <ShareButton
                  url="/tools/deck-builder"
                  title="Commander Deck Builder"
                  text="Build a strategy-aware Commander deck with combos on LGS Card Vault."
                  label="Share deck builder"
                />
              )}
            </div>
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
            {(
              isPublic
                ? [
                    { step: '01', title: 'Find a commander', body: 'Search the full legal catalog, not just what one store stocks.' },
                    { step: '02', title: 'Pick a strategy', body: 'We detect the builds that commander actually supports.' },
                    { step: '03', title: 'Build your list', body: 'Get synergy picks, Spellbook combos, and a full 100-card deck.' },
                  ]
                : [
                    { step: '01', title: 'Find a commander', body: 'Search the full legal catalog, not just what is on the shelf.' },
                    { step: '02', title: 'Pick a strategy', body: 'We detect the builds that commander actually supports.' },
                    { step: '03', title: 'Fill from stock', body: 'Add enablers, fuel, and payoffs that this store has in stock.' },
                  ]
            ).map((item) => (
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
            <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-24 xl:w-[22rem] xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm dark:glass-card">
                <div className="flex gap-3.5 p-4">
                  <div className="relative aspect-5/7 w-28 shrink-0 overflow-hidden rounded-md bg-bg shadow-sm sm:w-32">
                    <CardImage
                      src={selected.imageUrl}
                      alt={selected.name}
                      fit="contain"
                      className="absolute inset-0 size-full"
                      showLabel={false}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-extrabold leading-snug text-fg sm:text-lg">
                      {selected.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
                      {selected.typeLine}
                    </p>
                    <div className="mt-2.5">{colorPips(selected.colorIdentity)}</div>
                    {recommend.data?.commander.themes && recommend.data.commander.themes.length > 0 && (
                      <p className="mt-2 line-clamp-1 text-[0.7rem] font-medium capitalize text-fg-muted">
                        {recommend.data.commander.themes
                          .slice(0, 3)
                          .map((tag) => tag.replaceAll('_', ' '))
                          .join(' · ')}
                      </p>
                    )}
                    <button
                      type="button"
                      className="mt-2.5 text-sm font-semibold text-brand-600 underline-offset-2 transition-colors hover:text-brand-500 hover:underline"
                      onClick={clearCommander}
                    >
                      Change commander
                    </button>
                  </div>
                </div>

                {!isPublic && (
                <div className="border-t border-border">
                  <button
                    type="button"
                    aria-expanded={constraintsOpen}
                    aria-controls="deck-builder-constraints"
                    onClick={() => setConstraintsOpen((open) => !open)}
                    className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
                        Build constraints
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
                        {[
                          includeOutOfStock ? 'Out of stock on' : 'In stock only',
                          budgetDollars.trim() ? `Budget $${budgetDollars.trim()}` : null,
                          maxCardDollars.trim() ? `Max $${maxCardDollars.trim()}` : null,
                          bracket !== 'auto' ? `Bracket ${bracket}` : 'Auto bracket',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cx(
                        'mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200',
                        constraintsOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {constraintsOpen && (
                      <motion.div
                        id="deck-builder-constraints"
                        key="constraints"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">
                          <DeckBuildConstraintsFields
                            budgetDollars={budgetDollars}
                            setBudgetDollars={setBudgetDollars}
                            maxCardDollars={maxCardDollars}
                            setMaxCardDollars={setMaxCardDollars}
                            bracket={bracket}
                            setBracket={setBracket}
                            includeOutOfStock={includeOutOfStock}
                            setIncludeOutOfStock={setIncludeOutOfStock}
                            showOutOfStockToggle
                            onOutOfStockChange={resetPicks}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                )}
              </div>

              <div className="min-h-0 overflow-hidden rounded-card border border-border bg-surface shadow-sm">
                <button
                  type="button"
                  aria-expanded={strategiesOpen}
                  aria-controls="deck-builder-strategies"
                  onClick={() => setStrategiesOpen((open) => !open)}
                  className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
                      Strategy
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-fg">
                      {strategiesQuery.data?.find((s) => s.id === strategyId)?.label ??
                        (strategiesQuery.isLoading ? 'Loading strategies…' : 'Pick a strategy')}
                    </span>
                    {strategyId && (
                      <span className="mt-0.5 block text-xs text-fg-muted">
                        Tap to {strategiesOpen ? 'hide' : 'change'} strategies
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={cx(
                      'mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200',
                      strategiesOpen && 'rotate-180',
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {strategiesOpen && (
                    <motion.div
                      id="deck-builder-strategies"
                      key="strategies"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                      className="overflow-hidden border-t border-border"
                    >
                      <div className="max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:max-h-[min(32rem,calc(100vh-18rem))]">
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
                            return (
                              <button
                                key={strategy.id}
                                type="button"
                                onClick={() => {
                                  setStrategyId(strategy.id)
                                  resetPicks()
                                  // On stacked (mobile/tablet) layouts, collapse so the
                                  // package list moves up without another page scroll.
                                  if (
                                    typeof window !== 'undefined' &&
                                    !window.matchMedia('(min-width: 1280px)').matches
                                  ) {
                                    setStrategiesOpen(false)
                                  }
                                }}
                                className={cx(
                                  'w-full rounded-card border px-3.5 py-3 text-left transition-all duration-200',
                                  active
                                    ? 'border-brand-400 bg-brand-50/70 shadow-sm dark:bg-brand-500/12'
                                    : 'border-border bg-bg/40 hover:border-brand-300/70',
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-bold text-fg">{strategy.label}</p>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {active ? (
                                      <CheckCircle2 aria-hidden className="size-4 text-brand-600" />
                                    ) : (
                                      <span className="text-[0.65rem] font-bold tabular-nums text-fg-muted">
                                        {confidence}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                                  {strategy.description}
                                </p>
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
                    </motion.div>
                  )}
                </AnimatePresence>
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
                          {intelLine && !isPublic && (
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
                          {!isPublic && (
                            <>
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
                                  to={`/s/${routeSlug}/cart`}
                                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                                >
                                  Cart
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {bulkDone && !isPublic && (
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
                  slug={routeSlug}
                  publicMode={isPublic}
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
                  slug={routeSlug}
                  publicMode={isPublic}
                  loading={deck.isLoading}
                  deck={deck.data}
                  signedIn={signedIn}
                  busy={deckBusy}
                  onAddAll={() => void addDeckToCart()}
                  linkState={cardLinkState}
                  budgetDollars={budgetDollars}
                  setBudgetDollars={setBudgetDollars}
                  maxCardDollars={maxCardDollars}
                  setMaxCardDollars={setMaxCardDollars}
                  bracket={bracket}
                  setBracket={setBracket}
                  constraintsOpen={deckConstraintsOpen}
                  setConstraintsOpen={setDeckConstraintsOpen}
                  onOpenCardPreview={isPublic ? openCardPreview : undefined}
                />
              </TabPanel>
            </div>
          </>
        )}
      </section>

      {cardPreview && (
        <CardArtLightbox
          cards={cardPreview.cards}
          index={cardPreview.index}
          onClose={() => setCardPreview(null)}
          onIndexChange={(index) => setCardPreview((prev) => (prev ? { ...prev, index } : null))}
        />
      )}
    </div>
  )
}

function CombosPanel({
  slug,
  publicMode = false,
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
  publicMode?: boolean
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
    return (
      <LoadingPanel
        label={
          publicMode
            ? 'Checking Commander Spellbook combos…'
            : 'Checking Commander Spellbook against store stock…'
        }
      />
    )
  }
  if (combos.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="No combos found yet"
        description={
          publicMode
            ? 'Commander Spellbook did not return combos legal in this commander’s color identity.'
            : 'Commander Spellbook did not return combos legal in this commander’s color identity, or the store has none of the pieces in stock.'
        }
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
          {publicMode
            ? 'Combos come from Commander Spellbook and are filtered to this commander’s color identity.'
            : 'Only pieces this store actually has on the shelf count as in stock (any printing of the same card). Colorless cards are always allowed. Combos are ranked complete-in-store first, then by coverage.'}
          {filteredOutCount ? ` Hidden ${filteredOutCount} off-identity combo${filteredOutCount === 1 ? '' : 's'}.` : ''}
        </p>
      </div>
    <ul className="space-y-3">
      {combos.map((combo) => (
        <li key={combo.id || combo.description} className="rounded-card border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-fg">
                {publicMode
                  ? `${combo.cards.length} piece${combo.cards.length === 1 ? '' : 's'}`
                  : `${combo.inStockCount} of ${combo.cards.length} pieces in stock here`}
                {!publicMode && combo.completeInStore ? ' · all available here' : ''}
              </p>
              {combo.produces.length > 0 && (
                <p className="mt-1 text-xs text-fg-muted">{combo.produces.slice(0, 3).join(' · ')}</p>
              )}
            </div>
            {!publicMode && combo.completeInStore && <Badge tone="success">Buyable here</Badge>}
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
                  {piece.isCommander && !publicMode && !piece.inStock ? ' · commander (not in stock here)' : ''}
                  {piece.isCommander && (publicMode || piece.inStock) ? ' · commander' : ''}
                  {!publicMode && !piece.inStock && !piece.isCommander && ' · missing here'}
                  {piece.inStock && piece.stockQuantity != null && piece.stockQuantity > piece.quantity
                    ? ` · ${piece.stockQuantity} available`
                    : ''}
                </span>
                {!publicMode && piece.inventoryItem && (
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
  publicMode = false,
  loading,
  deck,
  signedIn,
  busy,
  onAddAll,
  linkState,
  budgetDollars,
  setBudgetDollars,
  maxCardDollars,
  setMaxCardDollars,
  bracket,
  setBracket,
  constraintsOpen = false,
  setConstraintsOpen,
  onOpenCardPreview,
}: {
  slug: string
  publicMode?: boolean
  loading: boolean
  deck: import('../hooks').AssembledDeckResponse | undefined
  signedIn: boolean
  busy: boolean
  onAddAll: () => void
  linkState?: DeckBuilderNavState
  budgetDollars?: string
  setBudgetDollars?: Dispatch<SetStateAction<string>>
  maxCardDollars?: string
  setMaxCardDollars?: Dispatch<SetStateAction<string>>
  bracket?: DeckBracket
  setBracket?: Dispatch<SetStateAction<DeckBracket>>
  constraintsOpen?: boolean
  setConstraintsOpen?: Dispatch<SetStateAction<boolean>>
  onOpenCardPreview?: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all')

  if (loading || !deck) {
    return (
      <LoadingPanel
        label={publicMode ? 'Assembling your Commander deck…' : 'Assembling a deck from store inventory…'}
      />
    )
  }

  const slotEntries = Object.entries(deck.slots).filter(
    ([key, count]) => key !== 'commander' && Number(count) > 0,
  )
  const structure = deck.structure?.actual ?? {}
  const targets = deck.structure?.targets ?? {}
  const inStockCount = deck.cards.filter((row) => row.inventoryItem).length
  const outOfStockCount = deck.cards.length - inStockCount
  const visibleCards = deck.cards.filter((row) => {
    if (stockFilter === 'in_stock') return Boolean(row.inventoryItem)
    if (stockFilter === 'out_of_stock') return !row.inventoryItem
    return true
  })
  const previewCards: CardArtPreview[] = visibleCards.map((row) => previewFromDeckRow(row))
  const intel = deck.intelligence
  const intelLine = intelligenceSummary(intel)
  const structureBits = (['lands', 'ramp', 'draw', 'removal'] as const)
    .map((role) => `${role} ${structure[role] ?? 0}/${targets[role] ?? 0}`)
    .join(' · ')

  return (
    <div className="space-y-4">
      {publicMode &&
        budgetDollars != null &&
        setBudgetDollars &&
        maxCardDollars != null &&
        setMaxCardDollars &&
        bracket != null &&
        setBracket &&
        setConstraintsOpen && (
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
            <button
              type="button"
              aria-expanded={constraintsOpen}
              aria-controls="deck-builder-deck-constraints"
              onClick={() => setConstraintsOpen((open) => !open)}
              className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fg-muted">
                  Build constraints
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
                  {[
                    budgetDollars.trim() ? `Budget $${budgetDollars.trim()}` : null,
                    maxCardDollars.trim() ? `Max $${maxCardDollars.trim()}` : null,
                    bracket !== 'auto' ? `Bracket ${bracket}` : 'Auto bracket',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Budget, card cap, and bracket for the 100-card list'}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cx(
                  'mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200',
                  constraintsOpen && 'rotate-180',
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {constraintsOpen && (
                <motion.div
                  id="deck-builder-deck-constraints"
                  key="deck-constraints"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <DeckBuildConstraintsFields
                      budgetDollars={budgetDollars}
                      setBudgetDollars={setBudgetDollars}
                      maxCardDollars={maxCardDollars}
                      setMaxCardDollars={setMaxCardDollars}
                      bracket={bracket}
                      setBracket={setBracket}
                      includeOutOfStock
                      setIncludeOutOfStock={() => {}}
                      showOutOfStockToggle={false}
                      publicMode
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      <div className="rounded-card border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-base font-extrabold text-fg">
              {deck.filledSize} / {deck.targetSize} · {deck.strategy.label}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {deck.bracket.label}
              {deck.bracket.auto ? ' · auto' : ''}
              {' · '}
              {deck.budget.limitCents != null
                ? `${formatPrice(deck.budget.spentCents)} of ${formatPrice(deck.budget.limitCents)}`
                : formatPrice(deck.budget.spentCents)}
              {' · '}
              {publicMode
                ? `${deck.cards.length} cards in list`
                : `${inStockCount}/${deck.cards.length} in stock`}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {structureBits} · avg MV {deck.averageManaValue}
            </p>
            {deck.gaps.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-warning-700">{deck.gaps[0]}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!publicMode && (
              <>
                {!signedIn ? (
                  <Link to="/login" className={buttonVariants({ size: 'sm' })}>
                    Sign in to add deck
                  </Link>
                ) : (
                  <Button size="sm" loading={busy} disabled={busy || deck.cards.length === 0} onClick={onAddAll}>
                    <ShoppingCart aria-hidden className="size-4" />
                    Add available
                  </Button>
                )}
                <Link to={`/s/${slug}/cart`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Cart
                </Link>
              </>
            )}
            {publicMode && (
              <Link to="/stores" className={buttonVariants({ size: 'sm' })}>
                Browse stores
              </Link>
            )}
          </div>
        </div>

        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-fg-muted transition-colors hover:text-fg">
            Build details
            {!publicMode && intel ? ` · ${Math.round(intel.confidence * 100)}% confidence` : ''}
            {deck.combos.length > 0
              ? ` · ${deck.combos.filter((c) => c.completeInStore).length}/${deck.combos.length} combos`
              : ''}
          </summary>
          <div className="mt-2 space-y-1.5 text-xs text-fg-muted">
            {!publicMode && intelLine && <p>{intelLine}</p>}
            {!publicMode && (
              <p>
                Built from {intel?.source ?? 'catalog'}
                {deck.budget.maxCardCents != null
                  ? ` · max ${formatPrice(deck.budget.maxCardCents)} / card`
                  : ''}
              </p>
            )}
            {publicMode && deck.budget.maxCardCents != null && (
              <p>Max {formatPrice(deck.budget.maxCardCents)} per card</p>
            )}
            {deck.bracket.gameChangersIncluded.length > 0 && (
              <p>
                Game Changers: {deck.bracket.gameChangersIncluded.map((c) => c.name).join(', ')}
              </p>
            )}
            {slotEntries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {slotEntries.map(([slot, count]) => (
                  <span
                    key={slot}
                    className="rounded-md bg-bg px-2 py-0.5 text-[0.65rem] font-semibold capitalize text-fg-muted"
                  >
                    {slot.replaceAll('_', ' ')} {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>

      {!publicMode && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-btn border border-border bg-bg p-0.5">
          {(
            [
              { id: 'all', label: `All (${deck.cards.length})` },
              { id: 'in_stock', label: `In stock (${inStockCount})` },
              { id: 'out_of_stock', label: `Not stocked (${outOfStockCount})` },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStockFilter(option.id)}
              className={cx(
                'rounded-btn px-2.5 py-1 text-xs font-bold transition-colors',
                stockFilter === option.id
                  ? 'bg-brand-500 text-white'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          Showing {visibleCards.length} of {deck.cards.length}
        </p>
      </div>
      )}

      {visibleCards.length === 0 ? (
        <EmptyState
          icon={Search}
          title={stockFilter === 'in_stock' ? 'No in-stock cards in this list' : 'No out-of-stock cards'}
          description={
            stockFilter === 'in_stock'
              ? 'This build has no buyable printings here. Switch to All or Not stocked to review the full list.'
              : 'Every card in this build is available at this store.'
          }
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visibleCards.map((row) => {
            const item = row.inventoryItem
            const name = item?.card.name ?? row.card.name
            const image = cardImage(item?.card ?? row.card)
            const detailPath = item && !publicMode ? `/s/${slug}/cards/${item.id}` : null
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
                {onOpenCardPreview ? (
                  <button
                    type="button"
                    onClick={() => onOpenCardPreview(previewCards, row.card.oracleId)}
                    className={cardArtButtonClassName(true)}
                    aria-label={`View ${name}`}
                  >
                    <CardImage src={image} alt={name} className="aspect-5/7 w-full" showLabel={false} />
                  </button>
                ) : detailPath ? (
                  <Link
                    to={detailPath}
                    state={linkState}
                    className="relative aspect-5/7 w-12 shrink-0 overflow-hidden rounded-md bg-bg"
                  >
                    <CardImage src={image} alt={name} className="absolute inset-0 size-full" showLabel={false} />
                  </Link>
                ) : (
                  <div className="relative aspect-5/7 w-12 shrink-0 overflow-hidden rounded-md bg-bg">
                    <CardImage src={image} alt={name} className="absolute inset-0 size-full" showLabel={false} />
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
                    {publicMode
                      ? [row.quantity > 1 ? `${row.quantity}×` : null, row.slot.replaceAll('_', ' ')]
                          .filter(Boolean)
                          .join(' · ')
                      : meta}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
