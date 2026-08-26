import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pin, Search, Sparkles, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, parsePriceInput } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { useDebouncedValue, useInventoryPage, useStore, useStoreGames, useStoreSpotlight } from '../../hooks'
import { GameSelector } from '../../components/catalog'
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Button,
  EmptyState,
  PageHeader,
  SpotlightRailSkeleton,
} from '../../components/ui'
import { CardImage, SpotlightCard } from '../../components/cards'
import { cx } from '../../lib/cx'
import { finishName } from '../../lib/finishes'
import {
  DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS,
  SPOTLIGHT_ITEMS_CAP,
  SPOTLIGHT_MAX_ITEMS,
  SPOTLIGHT_MIN_ITEMS_DEFAULT,
} from '../utils/actionsUtil'

export default function SpotlightTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)

  const [minPriceDollars, setMinPriceDollars] = useState('10.00')
  const [minItems, setMinItems] = useState(String(SPOTLIGHT_MIN_ITEMS_DEFAULT))
  const [maxItems, setMaxItems] = useState(String(SPOTLIGHT_MAX_ITEMS))
  const [pinnedIds, setPinnedIds] = useState<number[]>([])
  const [itemCache, setItemCache] = useState<Record<number, InventoryItem>>({})
  const [pickerQuery, setPickerQuery] = useState('')
  const [previewGame, setPreviewGame] = useState('')
  const debouncedPicker = useDebouncedValue(pickerQuery, 250)
  const railRef = useRef<HTMLDivElement>(null)
  const { data: storeGames = [] } = useStoreGames(slug)
  const gameOptions = useMemo(
    () => storeGames.map((game) => ({ code: game.code, name: game.name })),
    [storeGames],
  )

  useEffect(() => {
    if (!previewGame && gameOptions.length > 0) {
      setPreviewGame(gameOptions[0].code)
    }
  }, [gameOptions, previewGame])

  const liveSpotlight = useStoreSpotlight(
    slug,
    previewGame || undefined,
    Boolean(slug) && (gameOptions.length === 0 || Boolean(previewGame)),
  )
  const liveItems = liveSpotlight.data?.items ?? []
  const liveLoading = liveSpotlight.isPending && !liveSpotlight.data

  useEffect(() => {
    if (liveItems.length === 0) return
    setItemCache((current) => {
      const next = { ...current }
      let changed = false
      for (const item of liveItems) {
        if (!next[item.id]) {
          next[item.id] = item
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [liveItems])

  useEffect(() => {
    if (!store) return
    if (store.spotlightMinPriceCents !== undefined) {
      setMinPriceDollars((store.spotlightMinPriceCents / 100).toFixed(2))
    }
    if (store.spotlightMinItems !== undefined) {
      setMinItems(String(store.spotlightMinItems))
    }
    if (store.spotlightMaxItems !== undefined) {
      setMaxItems(String(store.spotlightMaxItems))
    }
    if (store.spotlightPinnedInventoryIds) {
      setPinnedIds(store.spotlightPinnedInventoryIds)
    }
  }, [store])

  const missingPinnedIds = pinnedIds.filter((id) => !itemCache[id])
  const pinnedLookups = useQueries({
    queries: missingPinnedIds.map((id) => ({
      queryKey: ['inventory-item', slug, id],
      queryFn: async () => {
        const { data } = await api.get<InventoryItem>(`/stores/${slug}/inventory/${id}`)
        return data
      },
      enabled: Boolean(slug && id),
      staleTime: 60 * 1000,
    })),
  })

  useEffect(() => {
    const next: Record<number, InventoryItem> = {}
    for (const query of pinnedLookups) {
      if (query.data?.id) next[query.data.id] = query.data
    }
    if (Object.keys(next).length === 0) return
    setItemCache((current) => ({ ...current, ...next }))
  }, [pinnedLookups])

  const pickerPage = useInventoryPage(slug, {
    q: debouncedPicker,
    inStockOnly: true,
    page: 1,
    itemsPerPage: 8,
    sort: 'name',
    enabled: debouncedPicker.trim().length >= 2,
  })
  const pickerHits = pickerPage.data?.items ?? []

  const pinnedItems = pinnedIds.map((id) => itemCache[id]).filter(Boolean)

  function remember(item: InventoryItem) {
    setItemCache((current) => ({ ...current, [item.id]: item }))
  }

  function pinItem(item: InventoryItem) {
    if (pinnedIds.includes(item.id) || pinnedIds.length >= SPOTLIGHT_ITEMS_CAP) return
    remember(item)
    setPinnedIds((current) => [...current, item.id])
  }

  function unpinItem(id: number) {
    setPinnedIds((current) => current.filter((itemId) => itemId !== id))
  }

  function movePinned(id: number, delta: number) {
    setPinnedIds((current) => {
      const index = current.indexOf(id)
      const nextIndex = index + delta
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const max = Math.min(
        SPOTLIGHT_ITEMS_CAP,
        Math.max(1, Number.parseInt(maxItems, 10) || SPOTLIGHT_MAX_ITEMS),
      )
      const min = Math.min(max, Math.max(0, Number.parseInt(minItems, 10) || 0))
      const { data } = await api.patch(`/stores/${slug}/settings`, {
        spotlightMinPriceCents: Math.max(0, parsePriceInput(minPriceDollars) ?? 0),
        spotlightMinItems: min,
        spotlightMaxItems: max,
        spotlightPinnedInventoryIds: pinnedIds,
      })
      return data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['store', slug] }),
        queryClient.invalidateQueries({ queryKey: ['store-spotlight', slug] }),
      ])
    },
  })

  function scrollRail(direction: 1 | -1) {
    const el = railRef.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  const currentCents = store?.spotlightMinPriceCents ?? DEFAULT_SPOTLIGHT_MIN_PRICE_CENTS
  const parsedMax = Math.min(SPOTLIGHT_ITEMS_CAP, Math.max(1, Number.parseInt(maxItems, 10) || SPOTLIGHT_MAX_ITEMS))
  const parsedMin = Math.min(parsedMax, Math.max(0, Number.parseInt(minItems, 10) || 0))

  const summary = useMemo(() => {
    const pinned = pinnedIds.length
    const auto = Math.max(0, parsedMax - pinned)
    return { pinned, auto, parsedMin, parsedMax }
  }, [pinnedIds.length, parsedMin, parsedMax])

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="relative px-5 py-6 sm:px-7 sm:py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/15 via-transparent to-accent-500/10"
          />
          <PageHeader
            className="relative"
            title={
              <span className="inline-flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                  <Sparkles aria-hidden className="size-5" />
                </span>
                Spotlight carousel
              </span>
            }
            subtitle="Pin individual singles, set how many cards the rail shows, and keep a price floor for the automatic picks."
            actions={
              <Button data-guide="Save spotlight" onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
                <Sparkles className="size-4" aria-hidden />
                Save spotlight
              </Button>
            }
          />
        </div>
      </div>

      <Card data-guide="Live storefront rail">
        <CardHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              Live storefront rail
              {previewGame ? (
                <span className="text-fg-muted">
                  · {gameOptions.find((game) => game.code === previewGame)?.name ?? previewGame}
                </span>
              ) : null}
            </span>
          }
          subtitle={
            liveItems.length > 0
              ? `This is the same carousel shoppers see — ${liveItems.length} ${liveItems.length === 1 ? 'card' : 'cards'} at or above ${formatPrice(store?.spotlightMinPriceCents ?? currentCents)}. Pin any of them to lock them at the front.`
              : `Shoppers currently see no spotlight for this game. Cards at or above ${formatPrice(store?.spotlightMinPriceCents ?? currentCents)} appear automatically after you save.`
          }
          actions={
            gameOptions.length > 1 ? (
              <GameSelector
                games={gameOptions}
                value={previewGame}
                onChange={setPreviewGame}
                label="Preview game"
              />
            ) : null
          }
        />
        <CardBody className="pt-2">
          {liveLoading ? (
            <SpotlightRailSkeleton />
          ) : liveSpotlight.isError ? (
            <p className="px-1 py-6 text-sm font-medium text-danger-700" role="alert">
              {extractErrorMessage(liveSpotlight.error, 'Could not load the storefront spotlight.')}
            </p>
          ) : liveItems.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No spotlight cards yet"
              description="Raise the minimum count, lower the price floor, or pin singles below. The storefront rail stays hidden until there is something to show."
              className="py-10 sm:py-12"
            />
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollRail(-1)}
                aria-label="Scroll spotlight left"
                className="absolute left-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-md transition-colors hover:text-brand-600 sm:grid"
              >
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollRail(1)}
                aria-label="Scroll spotlight right"
                className="absolute right-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-md transition-colors hover:text-brand-600 sm:grid"
              >
                <ChevronRight aria-hidden className="size-5" />
              </button>
              <div
                ref={railRef}
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-4 pb-2 pl-4 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:scroll-pl-14 sm:pl-14 [&::-webkit-scrollbar]:hidden"
              >
                {liveItems.map((item, index) => {
                  const pinned = pinnedIds.includes(item.id)
                  return (
                    <div key={item.id} className="flex w-40 shrink-0 flex-col sm:w-52">
                      <SpotlightCard
                        item={item}
                        slug={slug}
                        ribbon={pinned ? 'Pinned' : index === 0 ? 'Featured' : 'Auto'}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant={pinned ? 'secondary' : 'primary'}
                        className="mt-2"
                        onClick={() => (pinned ? unpinItem(item.id) : pinItem(item))}
                      >
                        <Pin aria-hidden className="size-3.5" />
                        {pinned ? 'Unpin' : 'Pin this'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SettingCard
          kicker="Price floor"
          title="Minimum price"
          hint={`Automatic picks start at ${formatPrice(Math.max(0, parsePriceInput(minPriceDollars) ?? currentCents))}. Pinned cards ignore this.`}
        >
          <Field label="Store price">
            {({ id }) => (
              <Input
                id={id}
                value={minPriceDollars}
                onChange={(e) => setMinPriceDollars(e.target.value)}
                inputMode="decimal"
                placeholder="10.00"
              />
            )}
          </Field>
        </SettingCard>
        <SettingCard
          kicker="Rail length"
          title="Minimum cards"
          hint="If not enough cards meet the price floor, fill with the next-highest in-stock singles."
        >
          <Field label="At least">
            {({ id }) => (
              <Input
                id={id}
                value={minItems}
                onChange={(e) => setMinItems(e.target.value)}
                inputMode="numeric"
              />
            )}
          </Field>
        </SettingCard>
        <SettingCard
          kicker="Rail length"
          title="Maximum cards"
          hint={`Cap the carousel at ${summary.parsedMax} ${summary.parsedMax === 1 ? 'card' : 'cards'} (up to ${SPOTLIGHT_ITEMS_CAP}).`}
        >
          <Field label="At most">
            {({ id }) => (
              <Input
                id={id}
                value={maxItems}
                onChange={(e) => setMaxItems(e.target.value)}
                inputMode="numeric"
              />
            )}
          </Field>
        </SettingCard>
      </div>

      <Card>
        <CardHeader
          title="Featured singles"
          subtitle="These listings always lead the spotlight, in this order. Search your in-stock inventory to add more."
        />
        <CardBody className="space-y-5">
          {pinnedItems.length > 0 ? (
            <ul className="space-y-2">
              {pinnedItems.map((item, index) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-card border border-border bg-bg/60 px-3 py-2.5"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-fg-muted">
                    {index + 1}
                  </span>
                  <CardImage
                    src={cardImage(item.card)}
                    alt=""
                    fit="contain"
                    showLabel={false}
                    className="h-14 w-10 shrink-0 rounded-btn"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-fg">{item.card.name}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {item.card.setCode?.toUpperCase() ?? '—'}
                      {item.card.collectorNumber ? ` · #${item.card.collectorNumber}` : ''}
                      {' · '}
                      {finishName(item.card, item.isFoil, item.finish)}
                      {' · '}
                      {formatPrice(item.priceCents)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton label="Move up" disabled={index === 0} onClick={() => movePinned(item.id, -1)}>
                      <ChevronUp className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={index === pinnedItems.length - 1}
                      onClick={() => movePinned(item.id, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </IconButton>
                    <IconButton label={`Remove ${item.card.name}`} onClick={() => unpinItem(item.id)}>
                      <X className="size-4" />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Pin}
              title="No pinned singles yet"
              description="The live rail above already shows your automatic spotlight. Pin any of those cards — or search below — to lock them at the front."
              className="py-8 sm:py-10"
            />
          )}

          <div className="space-y-3 border-t border-border pt-5">
            <Field label="Add from inventory">
              {({ id }) => (
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                  <Input
                    id={id}
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search in-stock cards by name or set…"
                    className="pl-9"
                  />
                </div>
              )}
            </Field>
            {debouncedPicker.trim().length >= 2 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {pickerPage.isFetching && pickerHits.length === 0 ? (
                  <p className="text-sm text-fg-muted sm:col-span-2">Searching inventory…</p>
                ) : pickerHits.length === 0 ? (
                  <p className="text-sm text-fg-muted sm:col-span-2">No in-stock matches.</p>
                ) : (
                  pickerHits.map((item) => {
                    const pinned = pinnedIds.includes(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={pinned || pinnedIds.length >= SPOTLIGHT_ITEMS_CAP}
                        onClick={() => pinItem(item)}
                        className={cx(
                          'flex items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors',
                          pinned
                            ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10'
                            : 'border-border bg-surface hover:border-brand-300 hover:bg-bg',
                        )}
                      >
                        <CardImage
                          src={cardImage(item.card)}
                          alt=""
                          fit="contain"
                          showLabel={false}
                          className="h-12 w-9 shrink-0 rounded-btn"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-fg">{item.card.name}</span>
                          <span className="block truncate text-xs text-fg-muted">
                            {formatPrice(item.priceCents)} · {item.card.setCode?.toUpperCase() ?? '—'}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-brand-600">
                          {pinned ? 'Pinned' : 'Pin'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <p className="text-sm text-fg-muted">
        Shoppers will see up to <span className="font-bold text-fg">{summary.parsedMax}</span>
        {summary.parsedMin > 0 ? (
          <>
            , and at least <span className="font-bold text-fg">{summary.parsedMin}</span> when stock allows
          </>
        ) : null}
        . {summary.pinned} pinned
        {summary.auto > 0 ? `, then up to ${summary.auto} automatic picks` : ''}.
      </p>

      {updateMutation.isSuccess && (
        <p className="text-sm font-medium text-success-700" role="status">
          Spotlight settings saved.
        </p>
      )}
      {updateMutation.isError && (
        <p className="text-sm font-medium text-danger-700" role="alert">
          {extractErrorMessage(updateMutation.error, 'Could not save spotlight settings.')}
        </p>
      )}
    </div>
  )
}

function SettingCard({
  kicker,
  title,
  hint,
  children,
}: {
  kicker: string
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <Card data-guide={title}>
      <CardBody className="space-y-4">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-brand-600">{kicker}</p>
          <h3 className="mt-1 text-base font-bold text-fg">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">{hint}</p>
        </div>
        {children}
      </CardBody>
    </Card>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-btn text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  )
}
