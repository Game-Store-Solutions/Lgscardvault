import { Search } from 'lucide-react'
import { EmptyState, LoadingPanel } from '../../components/ui'
import { GroupBySwitcher } from './GroupBySwitcher'
import { DECK_BUILDER_STICKY_TOOLBAR } from './layoutClasses'
import { SynergyPanelBody } from './synergy/SynergyPanelBody'
import type { DeckBuilderState } from './useDeckBuilderState'

type PublicSynergyPanelProps = Pick<
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
  | 'picked'
  | 'togglePick'
  | 'openCardPreview'
  | 'getPrintingSelection'
  | 'byRole'
  | 'byType'
>

export function PublicSynergyPanel({
  strategyId,
  strategiesQuery,
  recommend,
  recommendations,
  packageData,
  pickedOracleIds,
  nextCards,
  groupBy,
  setGroupBy,
  picked,
  togglePick,
  openCardPreview,
  getPrintingSelection,
  byRole,
  byType,
}: PublicSynergyPanelProps) {
  if (!strategyId || strategiesQuery.isLoading) {
    return <LoadingPanel label="Reading this commander's strategies…" />
  }

  if (recommend.isLoading) {
    return <LoadingPanel label="Building synergy picks…" />
  }

  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No package yet"
        description="No synergy picks matched this strategy yet. Try another strategy or commander."
      />
    )
  }

  return (
    <>
      <div className={DECK_BUILDER_STICKY_TOOLBAR}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-base font-extrabold text-fg">
              {packageData?.strategy.label}
              <span className="ml-2 text-sm font-semibold text-fg-muted">
                {recommendations.length} picks
              </span>
            </p>
            <p className="text-xs text-fg-muted">
              {packageData?.totalCandidates ?? recommendations.length} color-legal candidates
              {pickedOracleIds.length > 0
                ? ` · re-ranked for ${pickedOracleIds.length} pick${pickedOracleIds.length === 1 ? '' : 's'}`
                : ''}
              {nextCards.isFetching ? ' · updating…' : ''}
            </p>
          </div>
          <GroupBySwitcher groupBy={groupBy} onChange={setGroupBy} className="sm:max-w-xs" />
        </div>
      </div>

      <SynergyPanelBody
        groupBy={groupBy}
        byRole={byRole}
        byType={byType}
        picked={picked}
        togglePick={togglePick}
        openCardPreview={openCardPreview}
        getPrintingSelection={getPrintingSelection}
      />
    </>
  )
}
