import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { InventoryItem } from '../api/types'
import { useDebouncedValue } from './useDebouncedValue'

export interface CommanderSummary {
  id: string
  oracleId: string
  name: string
  typeLine?: string | null
  manaCost?: string | null
  cmc?: number | null
  colorIdentity?: string[]
  imageUrl?: string | null
  setCode?: string
  setName?: string | null
}

export interface SpellbookComboCard {
  name: string
  oracleId?: string | null
  imageUrl?: string | null
  quantity: number
  inStock: boolean
  isCommander?: boolean
  stockQuantity?: number
  colorIdentity?: string[]
  recommendedColors?: string[]
  inventoryItem: InventoryItem | null
}

export interface SpellbookCombo {
  id: string
  description: string
  status: string
  produces: string[]
  cards: SpellbookComboCard[]
  pieceCount?: number
  inStockCount: number
  missingCount: number
  missing: string[]
  completeInStore: boolean
  coverage?: number
}

export interface CommanderCombosResponse {
  commander: string
  colorIdentity?: string[]
  identityCode?: string
  legalColors?: string[]
  filteredOutCount?: number
  combos: SpellbookCombo[]
  source: string
}

/** Oracle-level card identity, present whether or not the store stocks it. */
export interface RecommendedCard {
  id: string
  oracleId: string
  name: string
  typeLine?: string | null
  manaCost?: string | null
  cmc?: number | null
  colorIdentity?: string[]
  imageUrl?: string | null
  edhrecRank?: number | null
  gameChanger?: boolean
}

/** Normalized contribution of each scoring term, for "why this card" UI. */
export type ScoreBreakdown = Partial<
  Record<
    | 'strategy_affinity'
    | 'existing_deck_synergy'
    | 'role_need'
    | 'relationship'
    | 'reference_frequency'
    | 'package_completion'
    | 'commander_affinity'
    | 'mana_curve'
    | 'popularity',
    number
  >
>

export interface AssembledDeckCard {
  slot: string
  /** Copies in the deck. Only basic lands ever exceed 1 (singleton format). */
  quantity: number
  role?: DeckRole
  deckRoles?: string[]
  packageComponents?: string[]
  score: number
  confidence?: number
  reasons?: string[]
  signals?: string[]
  scoreBreakdown?: ScoreBreakdown
  gameChanger?: boolean
  inStock?: boolean
  stockQuantity?: number
  priceCents?: number | null
  card: RecommendedCard
  /** Null when the card is recommended but not stocked here. */
  inventoryItem: InventoryItem | null
}

export interface AssembledDeckBudget {
  limitCents: number | null
  maxCardCents: number | null
  spentCents: number
  remainingCents: number | null
}

export interface AssembledDeckBracket {
  requested: number | null
  applied: number
  label: string
  auto: boolean
  maxGameChangers: number | null
  gameChangersInStock: { name: string; oracleId: string; priceCents: number }[]
  gameChangersIncluded: { name: string; oracleId: string; slot: string; priceCents: number }[]
  accommodated: boolean
}

/** Where the reference data behind a recommendation came from, and how much. */
export interface IntelligenceProvenance {
  requestedStrategy: string
  resolvedStrategy: string
  level:
    | 'commander_strategy'
    | 'related_strategy'
    | 'commander_overall'
    | 'strategy_global'
    | 'metadata'
  sampleSize: number
  confidence: number
  exactMatch: boolean
  source: string
}

export interface DeckStructure {
  targets: Record<string, number>
  actual: Record<string, number>
  packageTargets: Record<string, number>
  packageActual: Record<string, number>
}

export interface AssembledDeckResponse {
  commander: CommanderSummary & { themes?: string[] }
  identityCode: string
  strategies: CommanderStrategy[]
  strategy: Pick<CommanderStrategy, 'id' | 'label' | 'description'>
  intelligence: IntelligenceProvenance
  targetSize: number
  /** Total copies including the commander; should be 100 on a full build. */
  filledSize: number
  distinctCards: number
  slots: Record<string, number>
  structure: DeckStructure
  curve: Record<string, number>
  averageManaValue: number
  gaps: string[]
  cards: AssembledDeckCard[]
  combos: SpellbookCombo[]
  budget: AssembledDeckBudget
  bracket: AssembledDeckBracket
  inventoryIds: number[]
}

export type DeckRole = 'enabler' | 'fuel' | 'payoff' | 'support'
export type DeckCardType =
  | 'creature'
  | 'enchantment'
  | 'instant'
  | 'sorcery'
  | 'artifact'
  | 'land'
  | 'planeswalker'
  | 'other'

export interface CommanderStrategy {
  id: string
  label: string
  description: string
  confidence: number
  matchedSignals: string[]
  /** Reference decks classified into this strategy; 0 when text-inferred. */
  deckCount?: number
  sampleSize?: number
  source?: 'provider' | 'classifier' | 'catalog'
}

export interface CommanderRecommendation {
  score: number
  confidence?: number
  role: DeckRole
  roles: DeckRole[]
  deckRoles?: string[]
  packageComponents?: string[]
  cardType: DeckCardType
  /** Human-readable, generated while scoring — never after the fact. */
  reasons: string[]
  /** Raw matched theme tags and oracle-text needles behind those reasons. */
  signals?: string[]
  scoreBreakdown?: ScoreBreakdown
  inStock?: boolean
  stockQuantity?: number
  priceCents?: number | null
  card: RecommendedCard
  /** Null when the card is recommended but not stocked here. */
  inventoryItem: InventoryItem | null
}

export interface DeckContextSummary {
  size: number
  nonLandCount: number
  averageManaValue: number
  roles: Record<string, number>
  roleTargets: Record<string, number>
  packages: Record<string, number>
  packageTargets: Record<string, number>
  curve: Record<string, number>
  needs: string[]
}

export interface CommanderRecommendResponse {
  commander: CommanderSummary & { themes?: string[] }
  colorIdentity: string[]
  identityCode: string
  strategies: CommanderStrategy[]
  strategy: Pick<CommanderStrategy, 'id' | 'label' | 'description'>
  intelligence: IntelligenceProvenance
  deckContext: DeckContextSummary
  totalCandidates: number
  consideredCards: number
  excludedByLegality: Record<string, number>
  recommendations: CommanderRecommendation[]
  byRole: Record<DeckRole, CommanderRecommendation[]>
  byType: Record<DeckCardType, CommanderRecommendation[]>
}

export const PUBLIC_RECOMMEND_SCOPE = '__public__'

function recommendBase(scope: string): string {
  return scope === PUBLIC_RECOMMEND_SCOPE
    ? '/recommend'
    : `/stores/${encodeURIComponent(scope)}/recommend`
}

export function commanderSearchKey(slug: string, q: string) {
  return ['commander-search', slug, q] as const
}

export function commanderStrategiesKey(slug: string, cardId: string) {
  return ['commander-strategies', slug, cardId] as const
}

export function commanderRecommendKey(
  slug: string,
  cardId: string,
  strategy = '',
  includeOutOfStock = true,
) {
  return ['commander-recommend', slug, cardId, strategy, includeOutOfStock ? 'oos' : 'stock'] as const
}

/** Typeahead for legendary creature commanders at a store. */
export function useCommanderSearch(slug: string, query: string, enabled = true) {
  const debounced = useDebouncedValue(query.trim(), 250)
  return useQuery({
    queryKey: commanderSearchKey(slug, debounced),
    queryFn: async () => {
      const { data } = await api.get<CommanderSummary[]>(`${recommendBase(slug)}/commanders`, {
        params: { q: debounced, limit: 24 },
      })
      return data
    },
    enabled: enabled && Boolean(slug) && debounced.length >= 2,
  })
}

/** Strategies this commander supports (for the picker). */
export function useCommanderStrategies(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderStrategiesKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<{ strategies: CommanderStrategy[] }>(
        `${recommendBase(slug)}/commander/${cardId}/strategies`,
      )
      return data.strategies
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

/** Strategy-scoped deck package for a selected commander. */
export function useCommanderRecommendations(
  slug: string,
  cardId: string | null,
  strategy: string | null,
  enabled = true,
  opts?: { includeOutOfStock?: boolean },
) {
  const includeOutOfStock = opts?.includeOutOfStock ?? true
  return useQuery({
    queryKey: commanderRecommendKey(slug, cardId ?? '', strategy ?? '', includeOutOfStock),
    queryFn: async () => {
      const { data } = await api.get<CommanderRecommendResponse>(
        `${recommendBase(slug)}/commander/${cardId}`,
        {
          params: {
            strategy: strategy || undefined,
            limit: 80,
            includeOutOfStock: includeOutOfStock ? 1 : 0,
          },
        },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId) && Boolean(strategy),
  })
}

export function commanderCombosKey(slug: string, cardId: string) {
  return ['commander-combos', slug, cardId] as const
}

export function commanderDeckKey(
  slug: string,
  cardId: string,
  strategy = '',
  budgetCents: number | null = null,
  maxCardCents: number | null = null,
  bracket = 'auto',
) {
  return ['commander-deck', slug, cardId, strategy, budgetCents, maxCardCents, bracket] as const
}

export function commanderNextCardsKey(
  slug: string,
  cardId: string,
  strategy: string,
  deck: string[],
  includeOutOfStock = true,
) {
  // Deck membership is order-independent, so sort before keying or every
  // reorder would look like a new query.
  return [
    'commander-next-cards',
    slug,
    cardId,
    strategy,
    [...deck].sort().join(','),
    includeOutOfStock ? 'oos' : 'stock',
  ] as const
}

/** Spellbook combos for a commander, intersected with this store's stock. */
export function useCommanderCombos(slug: string, cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: commanderCombosKey(slug, cardId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<CommanderCombosResponse>(
        `${recommendBase(slug)}/commander/${cardId}/combos`,
        { params: { limit: 24 } },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

/**
 * 100-card deck built for a commander *and* a strategy.
 *
 * Passing `strategy` is what makes the build a coherent themed deck rather than
 * a pile of popular cards in the right colors, so it is part of the query key.
 */
export function useCommanderDeck(
  slug: string,
  cardId: string | null,
  enabled = true,
  opts?: {
    strategy?: string | null
    budgetCents?: number | null
    maxCardCents?: number | null
    bracket?: string
  },
) {
  const strategy = opts?.strategy ?? ''
  const budgetCents = opts?.budgetCents ?? null
  const maxCardCents = opts?.maxCardCents ?? null
  const bracket = opts?.bracket && opts.bracket !== 'auto' ? opts.bracket : 'auto'
  return useQuery({
    queryKey: commanderDeckKey(slug, cardId ?? '', strategy, budgetCents, maxCardCents, bracket),
    queryFn: async () => {
      const { data } = await api.get<AssembledDeckResponse>(
        `${recommendBase(slug)}/commander/${cardId}/deck`,
        {
          params: {
            strategy: strategy || undefined,
            budgetCents: budgetCents ?? undefined,
            maxCardCents: maxCardCents ?? undefined,
            bracket: bracket === 'auto' ? undefined : bracket,
          },
        },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId),
  })
}

/**
 * "What should I add next?" — recommendations that account for the cards already
 * chosen, so the list re-ranks as the user adds and removes cards.
 *
 * POST because a 99-card oracle-id list does not belong in a query string.
 */
export function useCommanderNextCards(
  slug: string,
  cardId: string | null,
  strategy: string | null,
  deckOracleIds: string[],
  enabled = true,
  opts?: { includeOutOfStock?: boolean },
) {
  const includeOutOfStock = opts?.includeOutOfStock ?? true
  return useQuery({
    queryKey: commanderNextCardsKey(
      slug,
      cardId ?? '',
      strategy ?? '',
      deckOracleIds,
      includeOutOfStock,
    ),
    queryFn: async () => {
      const { data } = await api.post<CommanderRecommendResponse>(
        `${recommendBase(slug)}/commander/${cardId}/next-cards`,
        {
          deck: deckOracleIds,
          strategy: strategy || undefined,
          limit: 40,
          includeOutOfStock,
        },
      )
      return data
    },
    enabled: enabled && Boolean(slug) && Boolean(cardId) && Boolean(strategy) && deckOracleIds.length > 0,
  })
}
