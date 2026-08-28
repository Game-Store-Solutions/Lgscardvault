import { Link } from 'react-router'
import { Check, Search, ShoppingCart } from 'lucide-react'
import { Button, buttonVariants, EmptyState, LoadingPanel } from '../../components/ui'
import { GroupBySwitcher } from './GroupBySwitcher'
import { SynergyPanelBody } from './synergy/SynergyPanelBody'
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
  | 'groupBy'
  | 'setGroupBy'
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
  | 'openCardPreview'
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
  groupBy,
  setGroupBy,
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
  openCardPreview,
  byRole,
  byType,
}: StoreSynergyPanelProps) {
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
              {packageData?.totalCandidates ?? recommendations.length} color-legal candidates
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
            <GroupBySwitcher groupBy={groupBy} onChange={setGroupBy} />
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

      <SynergyPanelBody
        groupBy={groupBy}
        byRole={byRole}
        byType={byType}
        storeSlug={routeSlug}
        picked={picked}
        togglePick={togglePick}
        openCardPreview={openCardPreview}
        signedIn={signedIn}
        cartQtyByInventoryId={cartQtyByInventoryId}
        onAdd={(item) => void addOne(item)}
        cartPending={cart.setItem.isPending}
      />
    </>
  )
}
