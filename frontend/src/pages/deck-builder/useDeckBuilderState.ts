import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { InventoryItem } from '../../api/types'
import { useAuth } from '../../context/AuthContext'
import {
  useCart,
  useCommanderCombos,
  useCommanderDeck,
  useCommanderNextCards,
  useCommanderRecommendations,
  useCommanderSearch,
  useCommanderStrategies,
  useStore,
  useDebouncedValue,
  PUBLIC_RECOMMEND_SCOPE,
} from '../../hooks'
import type { CommanderSummary } from '../../hooks'
import {
  dollarsToCents,
  loadDeckBuilderSession,
  parseDeckBuilderBracket,
  parseDeckBuilderPanel,
  parseDeckBuilderView,
  saveDeckBuilderSession,
  PUBLIC_DECK_BUILDER_SCOPE,
  type DeckBuilderNavState,
} from '../../lib/deckBuilder'
import type { CardArtPreview } from '../../components/cards'
import { intelligenceSummary } from './utils'

export type DeckBuilderMode = 'public' | 'store'

export function useDeckBuilderState(mode: DeckBuilderMode) {
  const isPublic = mode === 'public'
  const { slug: routeSlug = '' } = useParams()
  const apiScope = isPublic ? PUBLIC_RECOMMEND_SCOPE : routeSlug
  const sessionScope = isPublic ? PUBLIC_DECK_BUILDER_SCOPE : routeSlug
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const signedIn = Boolean(user)

  const { data: store, isLoading: storeLoading } = useStore(isPublic ? undefined : routeSlug)

  const [selected, setSelected] = useState<CommanderSummary | null>(() => {
    const commanderId = searchParams.get('commander')
    if (!commanderId) return null
    const stored = loadDeckBuilderSession(sessionScope)
    if (stored?.commander.id === commanderId) return stored.commander
    return { id: commanderId, oracleId: '', name: '' }
  })
  const [strategyId, setStrategyId] = useState<string | null>(() => searchParams.get('strategy'))
  const [view, setView] = useState<'roles' | 'types'>(() => parseDeckBuilderView(searchParams.get('view')))
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

  const pickedOracleIds = [...new Set([...picked.values()].map((entry) => entry.oracleId))].filter(Boolean)

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
        if (!item || cartQtyByInventoryId.has(item.id)) continue
        await cart.setItem.mutateAsync({ item, quantity: Math.min(1, item.quantity) })
      }
      setBulkDone(true)
    } finally {
      setDeckBusy(false)
    }
  }

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

  const searchResults = search.data ?? []
  const showSearchGrid = !selected && query.trim().length >= 2

  return {
    mode,
    isPublic,
    routeSlug,
    store,
    storeLoading,
    signedIn,
    selected,
    strategyId,
    setStrategyId,
    view,
    setView,
    picked,
    bulkBusy,
    bulkDone,
    panel,
    setPanel,
    deckBusy,
    query,
    budgetDollars,
    setBudgetDollars,
    maxCardDollars,
    setMaxCardDollars,
    bracket,
    setBracket,
    includeOutOfStock,
    setIncludeOutOfStock,
    constraintsOpen,
    setConstraintsOpen,
    deckConstraintsOpen,
    setDeckConstraintsOpen,
    strategiesOpen,
    setStrategiesOpen,
    cardPreview,
    setCardPreview,
    search,
    strategiesQuery,
    recommend,
    nextCards,
    combos,
    deck,
    cart,
    packageData,
    recommendations,
    byRole,
    byType,
    intelLine,
    pickedOracleIds,
    cartQtyByInventoryId,
    allSelected,
    resetPicks,
    handleQueryChange,
    togglePick,
    toggleSelectAll,
    addOne,
    addSelectedEnMasse,
    addDeckToCart,
    pickCommander,
    clearCommander,
    cardLinkState,
    openCardPreview,
    searchResults,
    showSearchGrid,
  }
}

export type DeckBuilderState = ReturnType<typeof useDeckBuilderState>
