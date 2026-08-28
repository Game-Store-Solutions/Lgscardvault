import { Link } from 'react-router'
import { Check, Search, ShoppingCart } from 'lucide-react'
import type { DeckRole } from '../../hooks'
import { Button, buttonVariants, EmptyState, LoadingPanel } from '../../components/ui'
import { cx } from '../../lib/cx'
import { ROLE_META, TYPE_LABELS, TYPE_ORDER } from './constants'
import { StoreSynergyRow } from './StoreSynergyRow'
import type { DeckBuilderState } from './useDeckBuilderState'

type StoreSynergyPanelProps = Pick<
  DeckBuilderState,
  | 'strategyId'
  | 'strategiesQuery'
  | 'recommend'
  | 'recommendations'
  | 'packageData'
  | 'pickedOracleIds'
  | 'nextCards'
  | 'view'
  | 'setView'
  | 'allSelected'
  | 'toggleSelectAll'
  | 'picked'
  | 'togglePick'
  | 'includeOutOfStock'
  | 'intelLine'
  | 'bulkBusy'
  | 'bulkDone'
  | 'signedIn'
  | 'routeSlug'
  | 'cartQtyByInventoryId'
  | 'cart'
  | 'addOne'
  | 'addSelectedEnMasse'
  | 'cardLinkState'
  | 'byRole'
  | 'byType'
>

export function StoreSynergyPanel({
  strategyId,
  strategiesQuery,
  recommend,
  recommendations,
  packageData,
  pickedOracleIds,
  nextCards,
  view,
  setView,
  allSelected,
  toggleSelectAll,
  picked,
  togglePick,
  includeOutOfStock,
  intelLine,
  bulkBusy,
  bulkDone,
  signedIn,
  routeSlug,
  cartQtyByInventoryId,
  cart,
  addOne,
  addSelectedEnMasse,
  cardLinkState,
  byRole,
  byType,
}: StoreSynergyPanelProps) {
  function renderRows(rows: typeof recommendations) {
    return (
      <ul className="space-y-2">
        {rows.map((row) => {
          const item = row.inventoryItem
          const inCart = item ? (cartQtyByInventoryId.get(item.id) ?? 0) : 0
          return (
            <StoreSynergyRow
              key={row.card.oracleId}
              row={row}
              slug={routeSlug}
              signedIn={signedIn}
              inCart={inCart}
              checked={picked.has(row.card.oracleId)}
              disabledPick={inCart > 0}
              adding={cart.setItem.isPending}
              onToggle={() => togglePick(row.card.oracleId, item)}
              onAdd={() => item && void addOne(item)}
              linkState={cardLinkState}
            />
          )
        })}
      </ul>
    )
  }

  if (!strategyId || strategiesQuery.isLoading) {
    return <LoadingPanel label="Reading this commander's strategies…" />
  }

  if (recommend.isLoading) {
    return <LoadingPanel label="Building your in-stock package…" />
  }

  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No package yet"
        description={
          includeOutOfStock
            ? 'This store does not currently stock enough cards for that strategy. Try another strategy, or ask the store to sync more Magic inventory.'
            : 'No in-stock cards matched. Turn on “Include out of stock” to see the full strategy package.'
        }
      />
    )
  }

  return (
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
                to={`/s/${routeSlug}/cart`}
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
  )
}
