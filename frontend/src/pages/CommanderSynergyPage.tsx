import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  Check,
  Crown,
  Layers,
  Search,
  ShoppingCart,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { cardImage, formatPrice } from '../api/client'
import type { InventoryItem } from '../api/types'
import { useAuth } from '../context/AuthContext'
import {
  useCart,
  useCommanderCombos,
  useCommanderDeck,
  useCommanderRecommendations,
  useCommanderSearch,
  useStore,
  useStoreTheme,
} from '../hooks'
import type { CommanderSummary, SpellbookCombo } from '../hooks'
import { Button, BackButton, buttonVariants, EmptyState, Input } from '../components/ui'
import { CardImage } from '../components/cards'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { ManaSymbol } from '../components/mtg/ManaSymbol'
import { finishName } from '../lib/finishes'
import { cx } from '../lib/cx'

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

export default function CommanderSynergyPage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const { data: store, isLoading: storeLoading } = useStore(slug)
  useStoreTheme(store)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CommanderSummary | null>(null)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDone, setBulkDone] = useState(false)
  const [panel, setPanel] = useState<'synergy' | 'combos' | 'deck'>('synergy')
  const [deckBusy, setDeckBusy] = useState(false)

  const search = useCommanderSearch(slug, query)
  const recommend = useCommanderRecommendations(slug, selected?.id ?? null)
  const combos = useCommanderCombos(slug, selected?.id ?? null, panel === 'combos' || panel === 'deck')
  const deck = useCommanderDeck(slug, selected?.id ?? null, panel === 'deck')
  const cart = useCart(slug, signedIn)
  const cartLines = cart.query.data ?? []
  const recommendations = recommend.data?.recommendations ?? []

  const cartQtyByInventoryId = new Map<number, number>()
  for (const line of cartLines) {
    if (line.inventoryItem?.id) {
      cartQtyByInventoryId.set(line.inventoryItem.id, line.quantity)
    }
  }

  const selectableIds = recommendations
    .map((row) => row.inventoryItem.id)
    .filter((id) => !cartQtyByInventoryId.has(id))

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => picked.has(id))

  function togglePick(id: number) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setBulkDone(false)
  }

  function toggleSelectAll() {
    setPicked((current) => {
      if (selectableIds.every((id) => current.has(id))) {
        return new Set()
      }
      return new Set(selectableIds)
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
      const rows = recommendations.filter((row) => picked.has(row.inventoryItem.id))
      for (const row of rows) {
        const item = row.inventoryItem
        const inCart = cartQtyByInventoryId.get(item.id) ?? 0
        const take = Math.min(item.quantity, Math.max(1, inCart + 1))
        await cart.setItem.mutateAsync({ item, quantity: take })
      }
      setPicked(new Set())
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
        if (cartQtyByInventoryId.has(item.id)) continue
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <BackButton to={`/s/${slug}`}>Back to store</BackButton>

      <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
            <Crown aria-hidden className="size-3.5" />
            Commander synergies
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-fg">
            Deck Builder
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            Search any commander-legal card (kept locally from Scryfall&apos;s weekly
            <span className="font-mono"> is:commander </span>
            sync). Rank in-stock synergies, sniff Commander Spellbook combos available
            here, or assemble a ~100-card list from this store&apos;s shelves.
          </p>
        </div>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-fg">Search commanders</span>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Atraxa, Krenko…"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </label>

          {search.isFetching && query.trim().length >= 2 && (
            <p className="text-sm text-fg-muted">Searching catalog…</p>
          )}

          {search.data && search.data.length > 0 && (
            <ul className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
              {search.data.map((commander) => {
                const active = selected?.id === commander.id
                return (
                  <li key={commander.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(commander)
                        setPicked(new Set())
                        setBulkDone(false)
                        setPanel('synergy')
                      }}
                      className={cx(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-brand-50' : 'hover:bg-bg',
                      )}
                    >
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-bg">
                        {commander.imageUrl ? (
                          <img src={commander.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-fg">{commander.name}</p>
                        <p className="truncate text-xs text-fg-muted">{commander.typeLine}</p>
                        <div className="mt-1">{colorPips(commander.colorIdentity)}</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {selected && (
            <div className="rounded-card border border-border bg-surface p-4 shadow-sm">
              <div className="flex gap-3">
                <div className="w-24 shrink-0">
                  <CardImage src={selected.imageUrl} alt={selected.name} />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-lg font-extrabold text-fg">{selected.name}</p>
                  <p className="text-sm text-fg-muted">{selected.typeLine}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {colorPips(selected.colorIdentity)}
                    {recommend.data?.identityCode && (
                      <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-fg-muted">
                        {recommend.data.identityCode}
                      </span>
                    )}
                  </div>
                  {recommend.data?.commander.themes && recommend.data.commander.themes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {recommend.data.commander.themes.slice(0, 8).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-brand-50 px-2 py-0.5 text-[0.7rem] font-semibold text-brand-700"
                        >
                          {tag.replaceAll('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {!selected ? (
            <EmptyState
              icon={Sparkles}
              title="Choose a commander"
              description="Search the local commanders catalog (every Scryfall-legal commander). We'll score this store's in-stock cards that fit its color identity and themes."
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {(
                  [
                    { id: 'synergy' as const, label: 'Synergies', icon: Sparkles },
                    { id: 'combos' as const, label: 'Combos', icon: Wand2 },
                    { id: 'deck' as const, label: '100-card deck', icon: Layers },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPanel(tab.id)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                      panel === tab.id
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface text-fg-muted ring-1 ring-border hover:text-fg',
                    )}
                  >
                    <tab.icon aria-hidden className="size-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {panel === 'synergy' && (
                <>
                  {recommend.isLoading ? (
                    <p className="text-sm text-fg-muted">Scoring in-stock synergies…</p>
                  ) : recommendations.length === 0 ? (
                    <EmptyState
                      icon={Search}
                      title="No in-stock synergies yet"
                      description="This store doesn't currently stock cards that share themes with this commander. Try another commander, or ask the store to sync more Magic inventory."
                    />
                  ) : (
                    <>
                      <div className="mb-4 flex flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-fg">
                            {recommendations.length} in-stock recommendation
                            {recommendations.length === 1 ? '' : 's'}
                          </p>
                          <p className="text-xs text-fg-muted">
                            From {recommend.data?.totalCandidates ?? recommendations.length} color-legal
                            candidates
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={toggleSelectAll}>
                            {allSelected ? 'Clear selection' : 'Select all'}
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
                              Add {picked.size || ''} to cart
                            </Button>
                          )}
                          {signedIn && (
                            <Link
                              to={`/s/${slug}/cart`}
                              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                            >
                              View cart
                            </Link>
                          )}
                        </div>
                      </div>

                      {bulkDone && (
                        <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-success-700">
                          <Check aria-hidden className="size-4" />
                          Selected cards added to your cart.
                        </p>
                      )}

                      <ul className="space-y-3">
                        {recommendations.map((row) => {
                          const item = row.inventoryItem
                          const inCart = cartQtyByInventoryId.get(item.id) ?? 0
                          const checked = picked.has(item.id)
                          return (
                            <li
                              key={item.id}
                              className="flex gap-3 rounded-card border border-border bg-surface p-3 shadow-sm"
                            >
                              <label className="flex shrink-0 items-start pt-1">
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
                                  checked={checked}
                                  disabled={inCart > 0}
                                  onChange={() => togglePick(item.id)}
                                  aria-label={`Select ${item.card.name}`}
                                />
                              </label>
                              <Link to={`/s/${slug}/cards/${item.id}`} className="w-16 shrink-0 sm:w-20">
                                <CardImage src={cardImage(item.card)} alt={item.card.name} />
                              </Link>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <Link
                                      to={`/s/${slug}/cards/${item.id}`}
                                      className="font-display text-base font-extrabold text-fg hover:text-brand-600"
                                    >
                                      {item.card.name}
                                    </Link>
                                    <p className="text-xs text-fg-muted">
                                      {item.card.typeLine}
                                      {' · '}
                                      {item.condition} / {finishName(item.card, item.isFoil, item.finish)}
                                      {' · '}
                                      {item.quantity} in stock
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-display text-lg font-extrabold text-fg">
                                      {formatPrice(item.priceCents)}
                                    </p>
                                    <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-fg-muted">
                                      score {(row.score * 100).toFixed(0)}
                                    </p>
                                  </div>
                                </div>
                                {row.reasons.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {row.reasons.map((reason) => (
                                      <span
                                        key={reason}
                                        className="rounded-full bg-bg px-2 py-0.5 text-[0.65rem] font-semibold text-fg-muted"
                                      >
                                        {reason.replaceAll('_', ' ')}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-3">
                                  {!signedIn ? (
                                    <Link
                                      to="/login"
                                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                                    >
                                      Sign in to add
                                    </Link>
                                  ) : inCart > 0 ? (
                                    <Link
                                      to={`/s/${slug}/cart`}
                                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                                    >
                                      <Check aria-hidden className="size-4" />
                                      In cart ({inCart})
                                    </Link>
                                  ) : (
                                    <Button
                                      size="sm"
                                      loading={cart.setItem.isPending}
                                      onClick={() => void addOne(item)}
                                    >
                                      <ShoppingCart aria-hidden className="size-4" />
                                      Add to cart
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </>
              )}

              {panel === 'combos' && (
                <CombosPanel
                  slug={slug}
                  loading={combos.isLoading}
                  combos={combos.data?.combos ?? []}
                  signedIn={signedIn}
                  cartQtyByInventoryId={cartQtyByInventoryId}
                  onAdd={(item) => void addOne(item)}
                  cartPending={cart.setItem.isPending}
                />
              )}

              {panel === 'deck' && (
                <DeckPanel
                  slug={slug}
                  loading={deck.isLoading}
                  deck={deck.data}
                  signedIn={signedIn}
                  busy={deckBusy}
                  onAddAll={() => void addDeckToCart()}
                />
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function CombosPanel({
  slug,
  loading,
  combos,
  signedIn,
  cartQtyByInventoryId,
  onAdd,
  cartPending,
}: {
  slug: string
  loading: boolean
  combos: SpellbookCombo[]
  signedIn: boolean
  cartQtyByInventoryId: Map<number, number>
  onAdd: (item: InventoryItem) => void
  cartPending: boolean
}) {
  if (loading) {
    return <p className="text-sm text-fg-muted">Checking Commander Spellbook against store stock…</p>
  }
  if (combos.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="No combos found yet"
        description="Commander Spellbook didn’t return combos for this commander, or the store has none of the pieces in stock."
      />
    )
  }

  return (
    <ul className="space-y-4">
      {combos.map((combo) => (
        <li key={combo.id || combo.description} className="rounded-card border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-fg">
                {combo.inStockCount} of {combo.cards.length} pieces in stock
                {combo.completeInStore ? ' · complete here' : ''}
              </p>
              {combo.produces.length > 0 && (
                <p className="mt-1 text-xs text-fg-muted">{combo.produces.slice(0, 3).join(' · ')}</p>
              )}
            </div>
            {combo.completeInStore && (
              <span className="rounded-full bg-success-100 px-2 py-0.5 text-[0.7rem] font-bold text-success-800">
                Buyable here
              </span>
            )}
          </div>
          {combo.description && (
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{combo.description}</p>
          )}
          <ul className="mt-3 space-y-2">
            {combo.cards.map((piece) => (
              <li
                key={`${combo.id}-${piece.name}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm"
              >
                <span className={piece.inStock ? 'font-medium text-fg' : 'text-fg-muted'}>
                  {piece.name}
                  {!piece.inStock && ' · missing'}
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
                      <Link to={`/s/${slug}/cards/${piece.inventoryItem.id}`} className="text-xs font-semibold text-brand-600">
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
  )
}

function DeckPanel({
  slug,
  loading,
  deck,
  signedIn,
  busy,
  onAddAll,
}: {
  slug: string
  loading: boolean
  deck: import('../hooks').AssembledDeckResponse | undefined
  signedIn: boolean
  busy: boolean
  onAddAll: () => void
}) {
  if (loading || !deck) {
    return <p className="text-sm text-fg-muted">Assembling a deck from store inventory…</p>
  }

  const slotEntries = Object.entries(deck.slots).filter(([key]) => key !== 'commander')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-fg">
            {deck.filledSize} / {deck.targetSize} cards from this store
          </p>
          <p className="text-xs text-fg-muted">
            Lands {deck.slots.land ?? 0} · Ramp {deck.slots.ramp ?? 0} · Draw {deck.slots.draw ?? 0} ·
            Removal {deck.slots.removal ?? 0} · Combo {deck.slots.combo ?? 0} · Synergy{' '}
            {deck.slots.synergy ?? 0}
          </p>
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
            View cart
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {slotEntries.map(([slot, count]) => (
          <span key={slot} className="rounded-full bg-bg px-2 py-0.5 text-[0.7rem] font-semibold text-fg-muted">
            {slot}: {count}
          </span>
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
          return (
            <li key={`${row.slot}-${item.id}`} className="flex gap-2 rounded-card border border-border bg-surface p-2">
              <Link to={`/s/${slug}/cards/${item.id}`} className="w-12 shrink-0">
                <CardImage src={cardImage(item.card)} alt={item.card.name} />
              </Link>
              <div className="min-w-0">
                <Link
                  to={`/s/${slug}/cards/${item.id}`}
                  className="block truncate text-sm font-semibold text-fg hover:text-brand-600"
                >
                  {item.card.name}
                </Link>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-muted">
                  {row.slot} · {formatPrice(item.priceCents)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
