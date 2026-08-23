import type { StorePageBackgrounds } from '../lib/pageBackgrounds'

export interface ApiError {
  response?: {
    status?: number
    data?: unknown
  }
}

export type CardDisplayStyle = 'gallery' | 'marketplace'

export interface StoreCommunityEventItem {
  id: string
  title: string
  startsAt: string
  description?: string
  location?: string
  externalUrl?: string
  pinned?: boolean
}

export interface StoreCommunityEvents {
  boardHeading?: string
  boardIntro?: string
  calendarUrl?: string
  items: StoreCommunityEventItem[]
}

export type HeroLayout =
  | 'cinematic'
  | 'living-inventory'
  | 'trading-table'
  | 'event-board'
  | 'floating-cards'
  // Deprecated / legacy (normalized client-side)
  | 'floating-collection'
  | 'store-story-hero'
  | 'collectors-shelf'
  | 'open-binder'
  | 'store-counter'
  | 'planeswalkers-desk'
  | 'shipping-station'
  | 'trophy-wall'
  | 'convention-booth'
  | 'library-shelf'
  | 'world-map'
  | 'gallery-wall'
  | 'vault'
  | 'command-center'
  | 'guild-hall'
  | 'mosaic-hero'
  | 'store-window'
  | 'day-night-hero'
  | 'storefront'
  | 'featured-card'
  | 'collection'
  | 'full-art'
  | 'trading-desk'
  | 'mascot'
  | 'dynamic'
  | 'video'
  | 'minimal'
  | 'banner'
  | 'spotlight'

export interface Store {
  id: number
  name: string
  slug: string
  isActive?: boolean
  featured?: boolean
  spotlightMinPriceCents?: number
  spotlightMinItems?: number
  spotlightMaxItems?: number
  spotlightPinnedInventoryIds?: number[]
  // Storefront branding (owner-managed via /settings)
  primaryColor?: string | null
  accentColor?: string | null
  backgroundColor?: string | null
  surfaceColor?: string | null
  textColor?: string | null
  mutedColor?: string | null
  borderColor?: string | null
  borderThickness?: number | null
  surfaceBlur?: number | null
  borderGlow?: number | null
  frameStyles?: Partial<Record<'hero' | 'tile' | 'card', Partial<{ borderThickness: number; borderGlow: number; surfaceBlur: number }>>> | null
  /** Dark-mode frames; omitted pieces inherit the light frameStyles. */
  darkFrameStyles?: Partial<Record<'hero' | 'tile' | 'card', Partial<{ borderThickness: number; borderGlow: number; surfaceBlur: number }>>> | null
  pageBackgrounds?: StorePageBackgrounds | null
  logoUrl?: string | null
  heroImageUrl?: string | null
  /** Optional dark-mode hero photo. Null = reuse heroImageUrl. */
  darkHeroImageUrl?: string | null
  /** Hero banner photo opacity in light mode (0–100). */
  heroImageOpacity?: number | null
  /** Hero banner photo opacity in dark mode. Null = inherit light. */
  darkHeroImageOpacity?: number | null
  /** Vertical crop 0–100 (0 = top, 50 = center, 100 = bottom). */
  heroImagePosition?: number | null
  /** Horizontal crop 0–100 (0 = left, 50 = center, 100 = right). */
  heroImagePositionX?: number | null
  /** Dark-mode vertical crop. Null = inherit light. */
  darkHeroImagePosition?: number | null
  /** Dark-mode horizontal crop. Null = inherit light. */
  darkHeroImagePositionX?: number | null
  /** Phone horizontal crop. Null = inherit desktop. */
  heroImagePositionMobileX?: number | null
  /** Phone vertical crop. Null = inherit desktop. */
  heroImagePositionMobileY?: number | null
  heroHeading?: string | null
  heroSubheading?: string | null
  tagline?: string | null
  cardDisplayStyle?: CardDisplayStyle
  heroLayout?: HeroLayout
  /** Optional dark-mode palette (same keys as the base colors); used when the shopper's theme is dark. */
  darkColors?: Partial<Record<'primaryColor' | 'accentColor' | 'backgroundColor' | 'surfaceColor' | 'textColor' | 'mutedColor' | 'borderColor', string>> | null
  /** Raw sell/trade rate settings; resolve effective rates via GET /stores/{slug}/trade-rates. */
  tradeRates?: TradeRateSettings | null
  // Storefront footer (owner-managed via /settings)
  hoursText?: string | null
  contactEmail?: string | null
  websiteUrl?: string | null
  facebookUrl?: string | null
  instagramUrl?: string | null
  twitterUrl?: string | null
  discordUrl?: string | null
  communityEvents?: StoreCommunityEvents | null
  // Enterprise onboarding (status/planKey in store:read; rest in store:admin)
  status?: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string | null
  planKey?: string | null
  subscriptionStatus?: string
  paymentMethodType?: string | null
  paymentLast4?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  latitude?: number | null
  longitude?: number | null
  owner?: {
    id: number
    email: string
    displayName: string
  }
  createdAt?: string
  compliance?: StoreCompliance | null
  complianceDocuments?: ComplianceDocumentMeta[]
  complianceReview?: {
    errors: string[]
    cdtfaVerifyUrl: string | null
  }
}

export interface StoreCompliance {
  legalBusinessName?: string
  entityType?: string
  sellerPermitNumber?: string
  ein?: string
  noStateSalesTax?: boolean
  cityLicenseNumber?: string
  usesBuyTrade?: boolean
  secondhandStatus?: string
  secondhandLicenseNumber?: string
  insuranceAttested?: boolean
}

export interface ComplianceDocumentMeta {
  id: number
  kind: 'seller_permit' | 'city_license' | 'secondhand' | string
  originalFilename: string
  mime: string
  createdAt: string
}

export interface PrivacyRequest {
  id: number
  type: 'access' | 'delete' | 'do_not_sell' | 'correct' | 'takedown' | string
  status: 'received' | 'in_progress' | 'completed' | 'rejected' | string
  email: string
  name: string
  details?: string | null
  californiaResident: boolean
  gpcSignal?: boolean
  adminNotes?: string | null
  createdAt: string
  completedAt?: string | null
  dueAt?: string
  daysRemaining?: number
  overdue?: boolean
  open?: boolean
}

export interface StorePaymentAccount {
  provider: 'square'
  status: 'connected' | 'disconnected' | 'error'
  environment: 'sandbox' | 'production' | string
  merchantId?: string | null
  locationId?: string | null
  scopes: string[]
  tokenExpiresAt?: string | null
  connectedAt?: string | null
  disconnectedAt?: string | null
  lastError?: string | null
}

export interface StorePaymentStatus {
  square: StorePaymentAccount | null
}

export interface SquareConnectResponse {
  authorizationUrl: string
  environment: 'sandbox' | 'production' | string
  scopes: string[]
}

export interface SsoStatus {
  configured: boolean
  providerName: string
  /** Public callback Google must allowlist. Shown so operators can copy it. */
  redirectUri?: string
}

export interface IntegrationStatus {
  configured: boolean
  provider?: string
  mode?: string
  envKeys: string[]
}

export interface AdminIntegrations {
  sso: IntegrationStatus & { providerName: string }
  addressAutocomplete: IntegrationStatus
  subscriptionPayments: IntegrationStatus
}

export interface Plan {
  key: string
  name: string
  priceCents: number
  tagline: string
  popular?: boolean
  features: string[]
}

export interface GeocodeSuggestion {
  label: string
  addressLine1: string
  city: string
  region: string
  postalCode: string
  country: string
  latitude: number | null
  longitude: number | null
}

export type PaymentMethodType = 'card' | 'apple_pay' | 'google_pay'

/** Store-scoped Square config for shopper checkout; contains no secrets. */
export interface StoreCheckoutConfig {
  enabled: boolean
  /** Shopper-safe copy when `enabled` is false. */
  message?: string | null
  /** Store owner / platform admin diagnostic when checkout is disabled. */
  ownerMessage?: string | null
  applicationId: string
  locationId: string
  environment: string
  currency: string
  countryCode: string
}

/** Public Square Web Payments SDK configuration; contains no secrets. */
export interface PaymentClientConfig {
  mode: 'square' | 'mock'
  environment: string
  applicationId: string
  locationId: string
  methods: PaymentMethodType[]
  currency: string
  countryCode: string
}

export interface StoreSubscriptionStatus extends PaymentClientConfig {
  planKey?: string | null
  planName?: string | null
  priceCents: number
  subscriptionStatus: string
  paymentMethodType?: PaymentMethodType | null
  paymentLast4?: string | null
  paymentConfigured: boolean
  /** End of the paid period, and therefore the date of the next charge. */
  currentPeriodEnd?: string | null
  lastChargedAt?: string | null
  /** Consecutive declined renewals; non-zero means the card needs attention. */
  failedAttempts: number
  nextAttemptAt?: string | null
}

/** Platform-side view of what store owners pay the marketplace. */
export interface AdminBillingSummary {
  /** Recurring revenue from subscriptions currently in good standing. */
  mrrCents: number
  /** Value of subscriptions that are past due or suspended. */
  overdueCents: number
  collectedThisMonthCents: number
  activeCount: number
  pastDueCount: number
  suspendedCount: number
  freeCount: number
  /** Subscriptions whose period has lapsed and are awaiting collection. */
  dueCount: number
}

export interface AdminBillingMonth {
  /** Calendar month as YYYY-MM. */
  month: string
  paidCents: number
  paidCount: number
  failedCount: number
}

export interface AdminSubscription {
  slug: string
  name?: string | null
  planKey?: string | null
  priceCents: number
  subscriptionStatus: string
  isActive: boolean
  paymentMethodType?: PaymentMethodType | null
  paymentLast4?: string | null
  hasCardOnFile: boolean
  currentPeriodEnd?: string | null
  lastChargedAt?: string | null
  failedAttempts: number
  nextAttemptAt?: string | null
  isOverdue: boolean
  ownerEmail?: string | null
}

export interface AdminSubscriptionCharge {
  id: number
  storeSlug?: string | null
  storeName?: string | null
  planKey?: string | null
  amountCents: number
  status: 'paid' | 'failed'
  reference?: string | null
  failureReason?: string | null
  attempt: number
  createdAt: string
}

export interface AdminBilling {
  summary: AdminBillingSummary
  months: AdminBillingMonth[]
  subscriptions: AdminSubscription[]
  recentCharges: AdminSubscriptionCharge[]
}

export interface AdminBillingRetryResult {
  outcome: string
  detail: string
  subscriptionStatus: string
  currentPeriodEnd?: string | null
}

export interface CardFace {
  name?: string
  imageUrl?: string
  imageUris?: {
    normal?: string
    small?: string
    large?: string
    png?: string
  }
  manaCost?: string
  typeLine?: string
  oracleText?: string
  power?: string
  toughness?: string
  loyalty?: string
  flavorText?: string
  artist?: string
  colors?: string[]
}

export interface CardSummary {
  id: string
  oracleId?: string
  /** Game this card belongs to (mtg, pokemon, onepiece, fab, riftbound); absent = mtg. */
  gameCode?: string
  name: string
  setCode?: string
  setName?: string
  collectorNumber?: string
  rarity?: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  cmc?: number
  imageUrl?: string
  imageUris?: {
    normal?: string
    small?: string
    large?: string
    png?: string
  }
  prices?: {
    usd?: string | null
    usd_foil?: string | null
    usd_etched?: string | null
    eur?: string | null
    eur_foil?: string | null
    tix?: string | null
  }
  colors?: string[]
  colorIdentity?: string[]
  keywords?: string[]
  power?: string
  toughness?: string
  loyalty?: string
  artist?: string
  flavorText?: string
  legalities?: Record<string, string>
  finishes?: string[]
  games?: string[]
  releasedAt?: string
  lang?: string
  layout?: string
  scryfallUri?: string
  /** Per-face art/text for multi-faced cards (transform, modal_dfc, flip, …). */
  cardFaces?: CardFace[]
}

export interface InventoryItem {
  id: number
  quantity: number
  priceCents: number
  /** What the store paid per copy; null = cost not tracked. */
  acquisitionCostCents?: number | null
  condition: 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'
  /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
  finish: string
  isFoil: boolean
  notes?: string | null
  card: CardSummary
}

export type StoreSectionMode = 'manual' | 'auto'

/** One inventory listing in a case section, with its own pool accounting. */
export interface StoreSectionCard {
  id: number
  position: number
  /** Copies allocated to this section's pool. */
  quantity: number
  /** Copies sold out of the pool. */
  soldQuantity: number
  /** Copies the section can still sell (quantity - sold). */
  remaining: number
  /** When staff confirmed the card is physically in the case; null = awaiting stocking. */
  stockedAt?: string | null
  /** True when the card still needs to be placed in the physical case. */
  needsStocking?: boolean
  inventoryItem: {
    id: number
    priceCents: number
    quantity: number
    condition: InventoryItem['condition']
    /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
    finish: string
    isFoil: boolean
    card: CardSummary | null
  }
}

/** A labeled section inside a display case — its own trackable inventory pool. */
export interface StoreSection {
  id: number
  case: { id: number; name: string } | null
  title: string
  position: number
  mode: StoreSectionMode
  autoMinPriceCents: number | null
  autoMaxPriceCents: number | null
  autoRarity: string | null
  /** Canonical color-identity code ("WU", "C", "M", …). */
  autoColorIdentity: string | null
  /** Human label for the code ("Azorius (WU)"). */
  autoColorIdentityLabel: string | null
  autoSetCode: string | null
  autoCardType: string | null
  /** Max distinct cards this section holds (its physical capacity); null = platform default (60). */
  cardLimit: number | null
  /** Total copies still sellable across the section's pool. */
  availableQuantity: number
  createdAt: string
  cards: StoreSectionCard[]
}

/** A physical display case: a named group of sections. */
export interface StoreCaseSummary {
  id: number
  name: string
  position: number
  createdAt: string
  sections: StoreSection[]
}

/** One row of a section's pull sheet: a case card staff must pull. */
export interface PullSheetRow {
  lineId: number
  cardName: string
  setCode: string | null
  collectorNumber: string | null
  quantity: number
  orderReference: string | null
  orderStatus: string | null
  customerName: string | null
  customerEmail: string | null
  orderedAt: string | null
}

export interface PullSheet {
  caseName: string | null
  sectionTitle: string
  generatedAt: string
  totalCards: number
  rows: PullSheetRow[]
}

/** One row of a section's stocking sheet: a card staff must place INTO the case. */
export interface StockingSheetRow {
  sectionCardId: number
  cardName: string
  setCode: string | null
  collectorNumber: string | null
  condition: string | null
  /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
  finish: string
  isFoil: boolean
  priceCents: number | null
  copies: number
}

export interface StockingSheet {
  caseName: string | null
  sectionTitle: string
  generatedAt: string
  totalCards: number
  rows: StockingSheetRow[]
}

export interface StoreCustomer {
  // `id` is null when the current user has no saved profile for the store yet
  // (the GET endpoint returns an empty representation rather than persisting one).
  id: number | null
  phone?: string | null
  shippingAddress?: string | null
  paymentBrand?: string | null
  paymentLast4?: string | null
  paymentExpires?: string | null
  paymentMethodType?: PaymentMethodType | null
  paymentConfigured?: boolean
  /** True when this store can charge a card on file (one-click checkout). */
  savedCardReady?: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface CustomerFavorite {
  id: number
  inventoryItem: InventoryItem
  createdAt: string
  storeSlug?: string | null
  storeName?: string | null
}

export interface CartItem {
  id: number
  quantity: number
  /** True when this line is a sealed product rather than a single. */
  isSealed?: boolean
  /** Singles listing; null on sealed lines. */
  inventoryItem: InventoryItem | null
  /** Sealed listing; null on singles lines. */
  sealedItem?: SealedInventoryLine | null
  createdAt: string
  updatedAt: string
}

export interface CustomerWantListEntry {
  id: number
  card?: CardSummary | null
  cardName: string
  setCode?: string | null
  /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
  finish: string
  isFoil: boolean
  quantity: number
  notes?: string | null
  /** Store listing to open on the storefront, when one matches this want. */
  inventoryItemId?: number | null
  createdAt: string
  storeSlug?: string | null
  storeName?: string | null
}

export type CsvImportJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'paused' | 'cancelled'

/** `skipped` is set by the operator during failed-row recovery: settled work. */
export type CsvImportRowStatus = 'queued' | 'processing' | 'imported' | 'error' | 'skipped'

export interface CsvImportRow {
  rowIndex: number
  name: string
  game: string
  set: string
  condition: string
  /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
  finish: string
  isFoil: boolean
  rarity: string
  quantity: number
  variant: string
  collectorNumber: string
  status: CsvImportRowStatus
  card?: CardSummary | null
  error?: string | null
  importedItemId?: number
  /** Sell price in cents, when the operator set one during recovery. */
  priceCents?: number | null
}

export interface CsvImportJob {
  id: number
  status: CsvImportJobStatus
  /** Game this import targets; legacy jobs report 'mtg'. */
  gameCode: string
  /** Whether rows are singles or sealed products. */
  importType: 'cards' | 'sealed'
  originalFilename: string
  storagePath: string
  totalRows: number
  processedRows: number
  importedRows: number
  failedRows: number
  skippedRows?: number
  queuedRows: number
  processingRows: number
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  rowOffset: number
  rowLimit: number
  rows: CsvImportRow[]
}

/* ---------- Failed-row recovery ----------
 * Served by the isolated recovery API
 * (/api/stores/{slug}/csv-imports/{id}/recovery), which is deliberately
 * separate from /catalog/search so recovery behaviour cannot leak into the
 * other screens that read the shared catalog. */

/** Which filter the search ladder had to drop to find anything. */
export type RecoveryRelaxation = 'alchemyName' | 'collectorNumber' | 'rarity' | 'set' | 'fuzzyName'

/** A printing that matched but may not be stocked, and why. */
export interface RecoveryRejectedCard {
  card: CardSummary
  reason: string
}

export interface RecoverySearchResponse {
  items: CardSummary[]
  rejected: RecoveryRejectedCard[]
  relaxed: RecoveryRelaxation[]
}

/** Failed rows bucketed by cause, biggest bucket first. */
export interface RecoveryErrorGroup {
  reason: string
  count: number
  rowIndexes: number[]
}

export interface RecoveryRowCounts {
  queued: number
  processing: number
  imported: number
  error: number
  skipped: number
}

export interface RecoveryQueue {
  gameCode: string
  counts: RecoveryRowCounts
  groups: RecoveryErrorGroup[]
  rows: CsvImportRow[]
  /** True when more failed rows exist than this payload includes. */
  truncated?: boolean
}

export interface CsvImportJobSummary {
  id: number
  status: CsvImportJobStatus
  gameCode: string
  importType: 'cards' | 'sealed'
  originalFilename: string
  totalRows: number
  processedRows: number
  importedRows: number
  failedRows: number
  skippedRows?: number
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
}

export interface UserProfile {
  id: number
  email: string
  displayName: string
  avatarUrl?: string | null
  roles: string[]
  emailVerified?: boolean
  ageVerified?: boolean
  ownedStores: Pick<Store, 'id' | 'name' | 'slug'>[]
  /** Stores this user administers as staff (not as the owner). */
  managedStores?: Pick<Store, 'id' | 'name' | 'slug'>[]
  paymentBrand?: string | null
  paymentLast4?: string | null
  paymentExpires?: string | null
  paymentMethodType?: PaymentMethodType | null
  paymentConfigured?: boolean
}

export interface AdminUser {
  id: number
  email: string
  displayName: string
  roles: string[]
  emailVerified: boolean
  ageVerified?: boolean
}

export interface AdminUserImportIssue {
  row: number
  email: string | null
  message: string
}

export interface AdminUserImportResult {
  created: number
  skipped: number
  resetEmailsSent: number
  resetEmailsOmitted: number
  dryRun: boolean
  errors: AdminUserImportIssue[]
  warnings: AdminUserImportIssue[]
}

export interface ScryfallSyncResult {
  /** 'queued' — the sync now runs asynchronously on the messenger worker. */
  status: string
  type?: string
  run?: ScryfallSyncRun
  inserted?: number
  updated?: number
  total?: number
}

export interface ScryfallSyncRun {
  id: number
  source: 'scryfall'
  bulkType: 'oracle_cards' | 'default_cards' | string
  label: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt: string | null
  summary: {
    inserted?: number
    updated?: number
    total?: number
    processed?: number
  } | null
  error: string | null
}

export interface OrderLine {
  id: number
  cardName: string
  quantity: number
  priceCents: number
  /** Per-unit cost snapshotted at sale time (store-staff endpoints only). */
  acquisitionCostCents?: number | null
  /** Set when (part of) the line sold out of a display-case section. */
  caseName?: string | null
  sectionTitle?: string | null
  /** How many of the line's copies staff pull from the case (0 = none). */
  caseQuantity?: number
  imageUrl?: string | null
  imageUris?: {
    normal?: string
    small?: string
    large?: string
    png?: string
  } | null
  setCode?: string | null
  collectorNumber?: string | null
}

export type OrderFulfillment = 'pickup' | 'shipping'

export interface CheckoutQuote {
  subtotalCents: number
  creditCents: number
  taxCents: number
  dueCents: number
  fulfillment: 'pickup'
  taxNote?: string
  taxReady?: boolean
  taxBlockReason?: string | null
}

export type OrderChannel = 'online' | 'kiosk'

export interface Order {
  id: number
  reference: string
  status: OrderStatus
  storeName?: string | null
  storeSlug?: string | null
  customerName?: string
  customerEmail?: string
  fulfillment?: OrderFulfillment
  channel?: OrderChannel
  totalCents: number
  /** Store credit spent on this order, in cents (0 = none). */
  creditAppliedCents?: number
  /** Cash captured by Square, in cents. Zero for unpaid pay-in-store orders. */
  paidCents?: number
  /** Sales tax collected at the store location, in cents. */
  taxCents?: number
  /** Staff-facing checkout note, e.g. "Paying in store". */
  notes?: string | null
  /** Square chargeback / dispute, when a webhook recorded one. */
  disputeStatus?: string | null
  disputeReason?: string | null
  disputedAt?: string | null
  /** Square hosted checkout URL returned once when a pay-in-store QR is minted. */
  paymentUrl?: string | null
  createdAt: string
  lines?: OrderLine[]
}

/** Customer order lists (`/me/orders`, `/stores/{slug}/customer/orders`). */
export interface PaginatedOrders {
  items: Order[]
  total: number
  page: number
  itemsPerPage: number
}

/** Shared shape for /me activity lists (want list, favorites, notifications, sell/trade). */
export interface PaginatedList<T> {
  items: T[]
  total: number
  page: number
  itemsPerPage: number
  unread?: number
}

export type OrderStatus = 'pending' | 'received' | 'fulfilled' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded'

/** A store's effective sell/trade payout rates right now (promo-resolved server-side). */
export interface TradeRates {
  creditPercent: number
  cashPercent: number
  buylistCreditPercent: number
  buylistCashPercent: number
  promoActive: boolean
  promoEndsAt: string | null
}

/** Raw per-store rate settings as stored (admin settings form). */
export interface TradeRateSettings {
  creditRatePercent?: number
  cashRatePercent?: number
  buylistCreditRatePercent?: number
  buylistCashRatePercent?: number
  promoCreditRatePercent?: number
  promoCashRatePercent?: number
  promoStartsAt?: string
  promoEndsAt?: string
}

/**
 * One card a store wants to buy. offerCents is a fixed pinned per-copy
 * offer; null means the store's premium buy-list rate × market applies.
 */
export interface BuylistEntry {
  id: number
  offerCents: number | null
  /** Treatment the store is buying, in the game's own words. */
  wantsFinish: string
  wantsFoil: boolean
  maxQuantity: number | null
  active: boolean
  notes: string | null
  createdAt: string
  card: CardSummary | null
}

export type SellSubmissionStatus = 'pending' | 'accepted' | 'declined' | 'completed'
export type SellPayoutMethod = 'credit' | 'cash'

export interface SellSubmissionItem {
  id: number
  cardId?: string | null
  cardName: string
  /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
  finish: string
  isFoil: boolean
  condition: string
  quantity: number
  acceptedQuantity: number | null
  offerCentsEach: number
  marketPriceCents: number
  isFromBuylist: boolean
  imageUris?: { normal?: string; small?: string } | null
  setCode?: string | null
}

export interface SellSubmission {
  id: number
  status: SellSubmissionStatus
  payoutMethod: SellPayoutMethod
  channel: 'online' | 'kiosk'
  kioskCustomerName?: string | null
  totalOfferCents: number
  totalMarketCents: number
  createdAt: string
  decidedAt: string | null
  archivedAt?: string | null
  customerName?: string | null
  customerEmail?: string | null
  items: SellSubmissionItem[]
  storeSlug?: string | null
  storeName?: string | null
}

export interface StoreCreditTransaction {
  id: number
  amountCents: number
  kind: 'sell_submission' | 'order' | 'adjustment'
  note: string | null
  orderReference?: string | null
  sellSubmissionId?: number | null
  createdAt: string
}

export interface StoreCreditSummary {
  balanceCents: number
  transactions: PaginatedList<StoreCreditTransaction> | StoreCreditTransaction[]
  storeSlug?: string | null
  storeName?: string | null
}

export interface StoreCreditBalance {
  storeSlug: string
  storeName: string
  balanceCents: number
}

export interface StoreCreditCustomer {
  userId: number
  email: string
  displayName: string
  balanceCents: number
  lastActivityAt: string
}

export interface StoreCreditLedger {
  outstandingCents: number
  customerCount: number
  customers: StoreCreditCustomer[]
}

export interface Deck {
  id: number
  name: string
  format: string | null
  notes: string | null
  cardCount: number
  createdAt: string
  updatedAt: string
  cards?: DeckCard[]
}

export interface DeckCard {
  id: number
  cardId: string | null
  cardName: string
  quantity: number
  imageUris?: { normal?: string; small?: string } | null
  setCode?: string | null
}

export interface CustomerNotification {
  id: number
  type: string
  title: string
  body: string
  orderId?: number | null
  orderReference?: string | null
  createdAt: string
  readAt?: string | null
  storeSlug?: string | null
  storeName?: string | null
}

/* ---------- Multi-game catalog (TCGCSV-sourced) ---------- */

export interface CatalogGame {
  id: number
  code: string
  name: string
  tcgcsvCategoryId: number | null
  position: number
  active: boolean
}

/** Catalog card art for the marketing background. A stable, curated selection. */
export interface CatalogShowcaseCard {
  id: string
  name: string
  gameCode: string
  imageUrl: string | null
  /** Quality-first art URLs (large → small). Walk this list; a CDN size can 404. */
  imageUrls?: string[]
}

/**
 * A supported game plus real card art for marketing tiles. `imageUrls` is
 * ordered best-first; catalog art lives on external CDNs where an individual
 * rendition can 404, so clients should try the next entry before giving up.
 */
export interface CatalogGameShowcase {
  code: string
  name: string
  imageUrls: string[]
}

export interface CatalogGameSet {
  id: number
  gameCode: string | null
  tcgcsvGroupId: number
  name: string
  code: string | null
  releaseDate: string | null
}

/** A sealed product (booster box, bundle, deck, …) from the shared catalog. */
export interface SealedProduct {
  id: number
  tcgcsvProductId: number
  gameCode: string | null
  gameName: string | null
  setId: number | null
  setName: string | null
  name: string
  imageUrl: string | null
  url: string | null
  marketPriceCents: number | null
  lowPriceCents: number | null
  updatedAt: string
}

export interface SealedSearchResult {
  items: SealedProduct[]
  total: number
  page: number
  perPage: number
}

/** One store's stock line for a sealed product. */
export interface SealedInventoryLine {
  id: number
  quantity: number
  priceCents: number
  acquisitionCostCents: number | null
  updatedAt: string
  product: SealedProduct | null
}

/** Storefront spotlight: a short rail plus the in-stock total. */
export interface SealedSpotlight {
  items: SealedInventoryLine[]
  total: number
}

export interface CatalogSyncRun {
  id: number
  gameCode: string | null
  gameName: string | null
  status: 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt: string | null
  summary: Record<string, number> | null
  error: string | null
}

/** One dry-run row from the import wizard's preview step. */
export interface ImportPreviewRow {
  rowIndex: number
  name: string
  set: string
  collectorNumber?: string
  quantity: number
  condition?: string
  /** Treatment in the game's own words: Nonfoil, Holofoil, Rainbow Foil. */
  finish?: string
  isFoil?: boolean
  priceCents?: number | null
  marketPriceCents?: number | null
  /** How the row resolved against the chosen game's catalog. */
  match: 'matched' | 'unmatched' | 'invalid'
  matchedName?: string | null
  matchedSet?: string | null
  imageUrl?: string | null
  error?: string | null
}

/** Validation report for an uploaded sheet — no rows are written. */
export interface ImportPreview {
  importType: 'cards' | 'sealed'
  gameCode: string
  totalRows: number
  invalidRows: number
  matchedRows: number
  unmatchedRows: number
  sampleSize: number
  totalQuantity: number
  sample: ImportPreviewRow[]
  warnings: string[]
}

/** A game a particular store carries, and what it stocks of it. */
export interface StoreGame extends CatalogGame {
  hasSingles: boolean
  hasSealed: boolean
}

export interface CatalogArtistBrowseResult {
  artist: string
  gameCode: string
  total: number
  offset: number
  limit: number
  items: CardSummary[]
}

/** Inventory headline numbers for one game at one store. */
export interface StoreGameStats {
  gameCode: string
  gameName: string
  singles: { listings: number; copies: number }
  sealed: { products: number; units: number }
}

/** Public in-stock shelf for the storefront (counts + set list). */
export interface StoreGameShelf {
  listings: number
  copies: number
  sets: { code: string; name: string }[]
}
