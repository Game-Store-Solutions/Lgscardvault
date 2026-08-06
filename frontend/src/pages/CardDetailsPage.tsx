import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import {
  ChevronRight,
  Heart,
  ListPlus,
  RefreshCw,
  RotateCw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserCircle,
} from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, parsePriceInput } from '../api/client'
import type { CardFace, CustomerFavorite, InventoryItem } from '../api/types'
import { useAuth } from '../context/AuthContext'
import {
  customerKeys,
  inventoryKey,
  useCanManageStore,
  useStoreCart,
  useCustomerFavorites,
  useCustomerWantList,
  useInventory,
  useStore,
  useStoreTheme,
} from '../hooks'
import { Badge, BackButton, Button, buttonVariants, ErrorState, TabPanel, Tabs } from '../components/ui'
import { FlipCard, InteractiveCard, SpotlightCard } from '../components/cards'
import { formatDate } from '../lib/format'
import { rarityAccent, rarityLabel } from '../lib/mtg'
import { finishName } from '../lib/finishes'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { CardText, ManaCost } from '../components/mtg/ManaSymbol'
import { plainCardText } from '../lib/cardText'
import { cx } from '../lib/cx'
import { buildMarketFinishRows, listingMarketSummary, MARKET_NO_DATA, MARKET_NOT_PRINTED } from '../lib/marketFinishes'
import {
  hasNonLegalScryfallEntries,
  legalFormatsFromScryfall,
  scryfallLegalityCount,
} from '../lib/cardLegalities'
import { EditInventoryModal, type InventoryEditPayload } from './store-admin/search'
import { CASE_CARDS_LABEL } from './utils/actionsUtil'
import { setBrowsePath } from '../lib/setBrowse'

/** Slugify a card name for an EDHREC deck-context link (front face only). */
function edhrecUrl(name: string): string {
  const slug = name
    .split('//')[0]
    .trim()
    .toLowerCase()
    .replace(/['’.,]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `https://edhrec.com/cards/${slug}`
}

/** Resolve the best available art URL for a single card face. */
function faceImage(face: CardFace): string | undefined {
  return face.imageUrl ?? face.imageUris?.normal ?? face.imageUris?.small
}

export default function CardDetailsPage() {
  const { slug = '', id = '' } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const manageListing = searchParams.get('manage') === '1'
  // Pages that link here can pass `state.from` so "back" returns to where the
  // shopper actually came from (e.g. the case cards page) instead of always
  // landing on the storefront.
  const cameFromCaseCards = (location.state as { from?: string } | null)?.from === 'case-cards'
  const setNavState = location.state as { from?: string; setCode?: string } | null
  const cameFromSet = setNavState?.from === 'set' && Boolean(setNavState.setCode)
  const backTo = cameFromCaseCards
    ? `/s/${slug}/case-cards`
    : cameFromSet && setNavState?.setCode
      ? setBrowsePath(slug, setNavState.setCode)
      : `/s/${slug}`
  const backLabel = cameFromCaseCards ? CASE_CARDS_LABEL : cameFromSet ? 'Set' : null
  const { user } = useAuth()
  const canManage = useCanManageStore(slug)
  const queryClient = useQueryClient()

  // Which face of a multi-faced card is currently shown (0 = front).
  const [faceIndex, setFaceIndex] = useState(0)
  const [infoTab, setInfoTab] = useState<'details' | 'legality'>('details')

  const { data: store } = useStore(slug)
  useStoreTheme(store)

  const {
    data: item,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory-item', slug, id],
    enabled: Boolean(slug && id),
    queryFn: async () => {
      const { data } = await api.get<InventoryItem>(`/stores/${slug}/inventory/${id}`)
      return data
    },
  })

  // Shared cache key with StorePage — usually warm — powers the recommendations rail.
  const { data: inventory = [] } = useInventory(slug)

  const { data: favorites = [] } = useCustomerFavorites(slug, Boolean(user))
  const { data: wantList = [] } = useCustomerWantList(slug, Boolean(user))
  const { query: cartQuery, setItem: cartSetItem } = useStoreCart(slug, Boolean(user))

  const favoriteMutation = useMutation({
    mutationFn: async ({ inventoryItem, favorite }: { inventoryItem: InventoryItem; favorite: boolean }) => {
      if (favorite) {
        await api.delete(`/stores/${slug}/customer/favorites/${inventoryItem.id}`)
      } else {
        await api.put(`/stores/${slug}/customer/favorites/${inventoryItem.id}`)
      }
    },
    onMutate: async ({ inventoryItem, favorite }) => {
      await queryClient.cancelQueries({ queryKey: customerKeys.favorites(slug) })
      const previous = queryClient.getQueryData<CustomerFavorite[]>(customerKeys.favorites(slug))
      queryClient.setQueryData<CustomerFavorite[]>(customerKeys.favorites(slug), (current = []) => {
        if (favorite) {
          return current.filter((entry) => entry.inventoryItem?.id !== inventoryItem.id)
        }
        if (current.some((entry) => entry.inventoryItem?.id === inventoryItem.id)) {
          return current
        }
        const optimistic: CustomerFavorite = {
          id: -inventoryItem.id,
          inventoryItem,
          createdAt: new Date().toISOString(),
        }
        return [...current, optimistic]
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(customerKeys.favorites(slug), context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: customerKeys.favorites(slug) })
    },
  })

  const wantListMutation = useMutation({
    mutationFn: async (inventoryItem: InventoryItem) => {
      await api.post(`/stores/${slug}/customer/want-list`, {
        cardId: inventoryItem.card.id,
        cardName: inventoryItem.card.name,
        setCode: inventoryItem.card.setCode,
        isFoil: inventoryItem.isFoil,
        quantity: 1,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerKeys.wantList(slug) })
    },
  })

  const updateListingMutation = useMutation({
    mutationFn: async (payload: InventoryEditPayload) => {
      const { data } = await api.patch<InventoryItem>(`/stores/${slug}/inventory/${payload.itemId}`, {
        cardId: payload.cardId,
        quantity: payload.quantity,
        priceCents: parsePriceInput(payload.priceText) ?? 0,
        acquisitionCostCents: parsePriceInput(payload.costText),
        condition: payload.condition,
        finish: payload.finish,
      })
      return data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-item', slug, id], updated)
      queryClient.setQueryData<InventoryItem[]>(inventoryKey(slug), (old = []) =>
        old.map((it) => (it.id === updated.id ? { ...it, ...updated } : it)),
      )
      void queryClient.invalidateQueries({ queryKey: inventoryKey(slug) })
      closeManageListing()
    },
    onError: (err) => {
      window.alert(extractErrorMessage(err, 'Could not save listing changes.'))
    },
  })

  function closeManageListing() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('manage')
        return next
      },
      { replace: true },
    )
  }

  if (isLoading) {
    return <StorePageLoader label="Loading card details…" />
  }

  if (error || !item) {
    return (
      <div className="rounded-card border border-border bg-surface">
        <ErrorState title="Card listing not found" description="This listing could not be loaded." />
      </div>
    )
  }

  const card = item.card

  // Multi-faced cards carry per-face art and text, but they come in two flavors:
  //  • Two-sided (transform / modal_dfc / …): each face has its own art, so the
  //    card physically turns over — flip front ↔ back.
  //  • Rotate (flip = 180°, split/aftermath = 90°): the two faces share a single
  //    image and you physically rotate the card in-plane to read the other side.
  const faces = card.cardFaces ?? []
  const twoSided = faces.filter((face) => faceImage(face)).length >= 2
  const ROTATE_LAYOUTS: Record<string, number> = { flip: 180, split: 90 }
  const rotateDeg = card.layout ? ROTATE_LAYOUTS[card.layout] : undefined
  const rotatable = !twoSided && rotateDeg !== undefined && faces.length >= 2
  const multiFace = twoSided || rotatable
  const flipped = multiFace ? faceIndex % 2 === 1 : false
  const activeFace = faces.length >= 2 ? faces[faceIndex % faces.length] : undefined
  const nextFace = faces.length >= 2 ? faces[(faceIndex + 1) % faces.length] : undefined

  const image = (activeFace ? faceImage(activeFace) : undefined) ?? cardImage(card)
  const rawOracleText = activeFace?.oracleText ?? card.oracleText
  // TCGCSV rules text is HTML; flatten it so tags never render as literal
  // text on cards synced before the sync-side fix.
  const oracleText = rawOracleText ? plainCardText(rawOracleText) : rawOracleText
  const isMagic = (card.gameCode ?? 'mtg') === 'mtg'
  const flavorText = activeFace?.flavorText ?? card.flavorText
  const typeLine = activeFace?.typeLine ?? card.typeLine
  const accent = rarityAccent(card.rarity)
  const legalFormats = legalFormatsFromScryfall(card.legalities)
  const legalityTotal = scryfallLegalityCount(card.legalities)
  const legalityHasHidden = hasNonLegalScryfallEntries(card.legalities)
  const isFavorite = favorites.some((favorite) => favorite.inventoryItem?.id === item.id)
  const isWanted = wantList.some(
    (entry) =>
      entry.card?.id === item.card.id ||
      (entry.cardName.toLowerCase() === item.card.name.toLowerCase() && entry.setCode === item.card.setCode),
  )

  const cartEntry = (cartQuery.data ?? []).find((entry) => entry.inventoryItem?.id === item.id)
  const inCart = Boolean(cartEntry)
  const outOfStock = item.quantity < 1

  const related = inventory.filter((i) => i.id !== item.id).slice(0, 10)

  const powerToughness = card.power || card.toughness ? `${card.power ?? '—'} / ${card.toughness ?? '—'}` : ''
  const specs = (
    [
      { label: 'Set', value: card.setName },
      { label: 'Rarity', value: card.rarity, capitalize: true },
      { label: 'Released', value: card.releasedAt ? formatDate(card.releasedAt) : '' },
      { label: 'Artist', value: card.artist },
      { label: 'Language', value: card.lang?.toUpperCase() },
      { label: 'Layout', value: card.layout, capitalize: true },
      { label: 'Games', value: card.games?.join(', ') },
      { label: 'Keywords', value: card.keywords?.join(', ') },
      { label: 'Power / Toughness', value: powerToughness },
    ] as { label: string; value?: string; capitalize?: boolean }[]
  ).filter((spec): spec is { label: string; value: string; capitalize?: boolean } => Boolean(spec.value))

  const priceRows = buildMarketFinishRows(card)
  const listingMarket = listingMarketSummary(card, item.isFoil, item.finish)
  const marketCents = listingMarket.priceCents
  const marketLabel = listingMarket.display
  const storeVsMarketCents =
    marketCents != null && listingMarket.display !== MARKET_NOT_PRINTED && listingMarket.display !== MARKET_NO_DATA
      ? item.priceCents - marketCents
      : null

  const samePrintListings = inventory.filter(
    (row) =>
      row.card.id === card.id ||
      (row.card.name === card.name &&
        row.card.setCode === card.setCode &&
        row.card.collectorNumber === card.collectorNumber),
  )
  const alternateListings = samePrintListings.filter((row) => row.id !== item.id)
  const lowestAlternateCents =
    alternateListings.length > 0 ? Math.min(...alternateListings.map((row) => row.priceCents)) : null

  const gameLabel =
    card.gameCode === 'mtg'
      ? 'Magic: The Gathering'
      : card.gameCode === 'pokemon'
        ? 'Pokémon'
        : card.gameCode === 'onepiece'
          ? 'One Piece'
          : card.gameCode === 'fab'
            ? 'Flesh and Blood'
            : card.gameCode === 'riftbound'
              ? 'Riftbound'
              : 'Singles'

  const bleed = '-mx-4 sm:-mx-6 lg:-mx-10'
  const inset = 'px-4 sm:px-6 lg:px-10'
  const setDisplay = card.setName ?? (card.setCode ? card.setCode.toUpperCase() : '')
  const setPageUrl = card.setCode ? setBrowsePath(slug, card.setCode) : null
  const productTitle = setDisplay ? `${card.name} - ${setDisplay}` : card.name
  const colPad = 'px-5 py-8 sm:px-8 lg:px-10'

  return (
    <div className={cx(bleed, 'pb-12')}>
      <div className={cx(inset, 'flex flex-wrap items-center justify-between gap-3 py-4')}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          <BackButton to={backTo} tone="soft" className="shrink-0">
            {backLabel ? `Back to ${backLabel}` : store?.name ?? 'Store'}
          </BackButton>
          <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border/70 sm:block" />
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm text-fg-muted sm:flex">
            <span className="truncate">{gameLabel}</span>
            {setDisplay && setPageUrl && (
              <>
                <ChevronSep />
                <Link to={setPageUrl} className="truncate text-fg hover:text-brand-600 hover:underline">
                  {setDisplay}
                </Link>
              </>
            )}
            {setDisplay && !setPageUrl && (
              <>
                <ChevronSep />
                <span className="truncate text-fg">{setDisplay}</span>
              </>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user && (
            <Link to={`/s/${slug}/account`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <UserCircle aria-hidden className="size-4" />
              <span className="hidden sm:inline">Account</span>
            </Link>
          )}
          {canManage && (
            <Link
              to={`/s/${slug}/cards/${item.id}?manage=1`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <Settings aria-hidden className="size-4" />
              <span className="hidden sm:inline">Manage</span>
            </Link>
          )}
        </div>
      </div>

      <div className={inset}>
        <article className="product-detail-sheet">
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)_minmax(22rem,28rem)] xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(24rem,32rem)] lg:items-start lg:gap-0">
          {/* Card art — left */}
          <div className={cx(colPad, 'order-1 lg:col-start-1 lg:row-start-1')}>
            <div className="mx-auto w-full max-w-[19rem] lg:mx-0 lg:max-w-none">
              {multiFace ? (
                <FlipCard
                  frontImage={faceImage(faces[0]) ?? cardImage(card)}
                  backImage={twoSided ? faceImage(faces[1]) : undefined}
                  rotateDeg={rotateDeg}
                  flipped={flipped}
                  onToggle={() => setFaceIndex((index) => (index + 1) % faces.length)}
                  alt={card.name}
                  foil={item.isFoil}
                  accent={accent}
                  borderless
                  className="w-full"
                />
              ) : (
                <InteractiveCard
                  image={image}
                  alt={activeFace?.name ?? card.name}
                  foil={item.isFoil}
                  accent={accent}
                  borderless
                  shadow={false}
                  className="w-full"
                />
              )}
            </div>
            {multiFace && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setFaceIndex((index) => (index + 1) % faces.length)}
              >
                {twoSided ? <RefreshCw aria-hidden className="size-4" /> : <RotateCw aria-hidden className="size-4" />}
                {twoSided ? `Flip to ${nextFace?.name ?? 'back'}` : `Rotate face`}
              </Button>
            )}
            <p className="mt-2 text-center text-xs text-fg-muted lg:text-left">
              {multiFace
                ? 'Drag to tilt · tap to flip'
                : item.isFoil
                  ? 'Hover for foil shine'
                  : 'Drag to tilt the card'}
            </p>
          </div>

          {/* Details + market — center */}
          <div className={cx(colPad, 'order-2 min-w-0 lg:col-start-2 lg:row-start-1')}>
            <header className="mb-5 max-w-3xl">
              <h1 className="text-2xl font-bold leading-snug text-fg lg:text-[1.65rem]">{productTitle}</h1>
              {setDisplay && setPageUrl && (
                <Link
                  to={setPageUrl}
                  className="mt-1 inline-block text-sm text-brand-600 underline-offset-2 hover:underline"
                >
                  {setDisplay}
                </Link>
              )}
              {setDisplay && !setPageUrl && (
                <p className="mt-1 text-sm text-brand-600">{setDisplay}</p>
              )}
              {(card.setCode ?? card.collectorNumber) && (
                <p className="mt-1 text-sm text-fg-muted">
                  {[card.setCode?.toUpperCase(), card.collectorNumber ? `#${card.collectorNumber}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {typeLine && <p className="mt-2 text-sm text-fg-muted">{typeLine}</p>}
            </header>

            <Tabs
              aria-label="Card information"
              value={infoTab}
              onChange={(id) => setInfoTab(id as 'details' | 'legality')}
              tabs={[
                { id: 'details', label: 'Product Details' },
                { id: 'legality', label: 'Legality' },
              ]}
            >
              <TabPanel when="details" value={infoTab} className="pt-5">
                {oracleText ? (
                  <div className="space-y-4">
                    <p className="whitespace-pre-line text-base leading-relaxed text-fg">
                      <CardText text={oracleText} symbolClassName="size-[1.1em]" />
                    </p>
                    {flavorText && (
                      <p className="pt-4 text-sm italic leading-relaxed text-fg-muted">{flavorText}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-fg-muted">No rules text for this card.</p>
                )}

                <dl className="mt-8 space-y-2.5 text-sm">
                  {card.rarity && <DetailRow label="Rarity" value={rarityLabel(card.rarity)} />}
                  {card.collectorNumber && <DetailRow label="#" value={card.collectorNumber} />}
                  {typeLine && <DetailRow label="Card type" value={typeLine} />}
                  {powerToughness && <DetailRow label="P / T" value={powerToughness} />}
                  {card.manaCost && (
                    <div className="flex gap-4">
                      <dt className="w-32 shrink-0 text-fg-muted">Mana cost</dt>
                      <dd>
                        <ManaCost cost={card.manaCost} className="size-5" />
                      </dd>
                    </div>
                  )}
                  {card.artist && (
                    <DetailRow
                      label="Artist"
                      value={
                        card.scryfallUri ? (
                          <a
                            href={card.scryfallUri}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-brand-600 hover:underline"
                          >
                            {card.artist}
                          </a>
                        ) : (
                          card.artist
                        )
                      }
                    />
                  )}
                  {specs
                    .filter((s) => !['Rarity', 'Power / Toughness'].includes(s.label))
                    .map((spec) => (
                      <DetailRow
                        key={spec.label}
                        label={spec.label}
                        value={spec.value}
                        capitalize={spec.capitalize}
                      />
                    ))}
                </dl>
              </TabPanel>

              <TabPanel when="legality" value={infoTab} className="pt-5">
                {!isMagic ? (
                  <p className="text-sm text-fg-muted">Format legality is available for Magic: The Gathering printings.</p>
                ) : legalityTotal === 0 ? (
                  <p className="text-sm text-fg-muted">
                    No legality data on file for this printing.{' '}
                    {card.scryfallUri ? (
                      <a href={card.scryfallUri} target="_blank" rel="noreferrer" className="font-bold text-brand-600 hover:underline">
                        View on Scryfall
                      </a>
                    ) : (
                      'Try refreshing catalog sync from Scryfall.'
                    )}
                  </p>
                ) : legalFormats.length > 0 ? (
                  <>
                    <p className="text-sm text-fg-muted">
                      Formats where this printing is{' '}
                      <span className="font-bold text-success-700">legal</span>, from Scryfall data stored on this card.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {legalFormats.map(({ key, label }) => (
                        <Badge key={key} tone="success" className="uppercase tracking-wide">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-fg-muted">
                    This printing is not legal in any tracked format. See Scryfall for restricted, banned, and format-specific rules.
                  </p>
                )}
                {isMagic && legalityHasHidden && (
                  <p className="mt-4 border border-border bg-bg/50 px-3 py-2.5 text-sm text-fg-muted">
                    Restricted, banned, and not-legal formats are not listed here.{' '}
                    {card.scryfallUri ? (
                      <a
                        href={card.scryfallUri}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-brand-600 hover:underline"
                      >
                        See the full list on Scryfall
                      </a>
                    ) : (
                      'See Scryfall for the full list'
                    )}
                    .
                  </p>
                )}
              </TabPanel>
            </Tabs>

            <section className="mt-10 border-t border-border pt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-fg">Market Price History</h2>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    {item.condition} · {finishName(card, item.isFoil, item.finish)}
                    {marketCents != null && (
                      <>
                        {' '}
                        · Market <span className="font-bold text-fg">{marketLabel}</span>
                      </>
                    )}
                    {marketCents === null && marketLabel !== MARKET_NO_DATA && (
                      <>
                        {' '}
                        · <span className="text-fg-muted">{marketLabel}</span>
                      </>
                    )}
                  </p>
                </div>
                {storeVsMarketCents != null && storeVsMarketCents !== 0 && (
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-1 text-xs font-bold',
                      storeVsMarketCents < 0 ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
                    )}
                  >
                    {storeVsMarketCents < 0
                      ? `${formatPrice(Math.abs(storeVsMarketCents))} below market`
                      : `${formatPrice(storeVsMarketCents)} above market`}
                  </span>
                )}
              </div>

              {marketCents != null && (
                <div className="mt-6 max-w-md">
                  <div className="mb-2 flex justify-between text-xs font-bold text-fg-muted">
                    <span>Store price</span>
                    <span>Market ({finishName(card, item.isFoil, item.finish)})</span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-bg">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-brand-500/90"
                      style={{
                        width: `${Math.min(100, Math.round((item.priceCents / Math.max(item.priceCents, marketCents, 1)) * 100))}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 rounded-full bg-fg-muted/35"
                      style={{
                        left: `${Math.min(100, Math.round((marketCents / Math.max(item.priceCents, marketCents, 1)) * 100))}%`,
                        width: '3px',
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-sm font-bold">
                    <span className="text-brand-600">{formatPrice(item.priceCents)}</span>
                    <span className="text-fg-muted">{marketLabel}</span>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Buy column — TCGplayer Direct-style stacked modules */}
          <aside className={cx(colPad, 'order-3 space-y-3 lg:col-start-3 lg:row-start-1')}>
            <div className="space-y-3 lg:sticky lg:top-16">
              <div className="tcg-buy-box overflow-hidden">
                <div className="flex items-center gap-2 border-b border-brand-200/90 bg-brand-50 px-3 py-2.5 dark:border-brand-500/25 dark:bg-brand-500/10">
                  <ShieldCheck aria-hidden className="size-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="text-sm font-bold text-brand-700 dark:text-brand-300">{store?.name ?? 'This store'}</span>
                </div>
                <div className="p-4">
                  <p className="text-sm text-fg-muted">{item.condition}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums leading-none text-fg">{formatPrice(item.priceCents)}</p>
                  {marketCents != null && (
                    <p className="mt-2 text-xs text-fg-muted">
                      Market price{' '}
                      <span className="font-semibold text-success-600 dark:text-success-500">{marketLabel}</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-fg-muted underline decoration-border underline-offset-2">
                    Sold by {store?.name ?? 'this store'}
                  </p>

                  <div className="mt-4 flex">
                    <div className="flex h-11 shrink-0 items-center gap-1 rounded-l-md border border-r-0 border-border bg-bg px-3 text-sm text-fg-muted">
                      <span className="font-semibold text-fg">1</span>
                      <span className="text-xs">of {Math.max(1, item.quantity)}</span>
                    </div>
                    {user ? (
                      inCart ? (
                        <Link
                          to={`/s/${slug}/cart`}
                          className={`${buttonVariants({ variant: 'primary', size: 'lg' })} h-11 flex-1 rounded-l-none rounded-r-md px-4 shadow-none`}
                        >
                          <ShoppingCart aria-hidden className="size-4" />
                          Checkout ({cartEntry?.quantity})
                        </Link>
                      ) : (
                        <Button
                          variant="primary"
                          size="lg"
                          className="h-11 flex-1 rounded-l-none rounded-r-md shadow-none"
                          loading={cartSetItem.isPending}
                          disabled={cartSetItem.isPending || outOfStock}
                          onClick={() => cartSetItem.mutate({ item, quantity: 1 })}
                        >
                          {outOfStock ? 'Out of stock' : 'Add to Cart'}
                        </Button>
                      )
                    ) : (
                      <Link
                        to="/login"
                        className={`${buttonVariants({ variant: 'primary', size: 'lg' })} h-11 flex-1 rounded-l-none rounded-r-md shadow-none`}
                      >
                        Sign in to buy
                      </Link>
                    )}
                  </div>

                  {user && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={favoriteMutation.isPending}
                        disabled={favoriteMutation.isPending}
                        onClick={() => favoriteMutation.mutate({ inventoryItem: item, favorite: isFavorite })}
                      >
                        <Heart aria-hidden className={`size-4 ${isFavorite ? 'fill-current' : ''}`} />
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={wantListMutation.isPending}
                        disabled={wantListMutation.isPending || isWanted}
                        onClick={() => wantListMutation.mutate(item)}
                      >
                        <ListPlus aria-hidden className="size-4" />
                        Want list
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {alternateListings.length > 0 && lowestAlternateCents != null && (
                <Link
                  to={setPageUrl ?? `/s/${slug}#store-search`}
                  className="tcg-buy-box block p-4 text-center text-sm transition-colors hover:bg-bg/50"
                >
                  <span className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                    View {alternateListings.length} Other Listing{alternateListings.length === 1 ? '' : 's'}
                  </span>
                  <span className="mt-1 block text-fg-muted">As low as {formatPrice(lowestAlternateCents)}</span>
                </Link>
              )}

              <div className="tcg-buy-box p-4">
                <h3 className="text-sm font-bold text-fg">
                  {item.condition} Comparison Prices
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {priceRows.map((row) => (
                    <li key={row.key} className="flex items-baseline justify-between gap-3">
                      <span className="text-fg-muted">{row.label}</span>
                      <span className={cx('font-semibold tabular-nums', row.muted ? 'text-fg-muted' : 'text-fg')}>
                        {row.display}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-fg-muted">
                {card.scryfallUri && (
                  <a href={card.scryfallUri} target="_blank" rel="noreferrer" className="hover:text-brand-600 hover:underline">
                    Scryfall
                  </a>
                )}
                <a href={edhrecUrl(card.name)} target="_blank" rel="noreferrer" className="hover:text-brand-600 hover:underline">
                  EDHREC
                </a>
              </div>
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="border-t border-border/40 px-5 py-8 sm:px-8 lg:px-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-display text-xl font-bold tracking-tight text-fg">More from {store?.name ?? 'this store'}</h2>
              <Link to={`/s/${slug}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                View all
              </Link>
            </div>
            <div className="scrollbar-none flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {related.map((rel) => (
                <SpotlightCard key={rel.id} item={rel} slug={slug} />
              ))}
            </div>
          </section>
        )}
      </article>
      </div>

      <EditInventoryModal
        slug={slug}
        item={manageListing ? item : null}
        inventory={inventory}
        pending={updateListingMutation.isPending}
        onClose={closeManageListing}
        onSave={(payload) => updateListingMutation.mutate(payload)}
      />
    </div>
  )
}

function ChevronSep() {
  return <ChevronRight aria-hidden className="size-3 shrink-0 text-fg-muted/50" />
}

function DetailRow({
  label,
  value,
  capitalize = false,
}: {
  label: string
  value: ReactNode
  capitalize?: boolean
}) {
  return (
    <div className="flex gap-6 py-0.5">
      <dt className="w-32 shrink-0 text-fg-muted">{label}</dt>
      <dd className={cx('min-w-0 text-fg', capitalize && 'capitalize')}>{value}</dd>
    </div>
  )
}
