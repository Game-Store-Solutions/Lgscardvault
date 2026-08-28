import { Search } from 'lucide-react'
import { EmptyState, LoadingPanel } from '../../components/ui'
import { GroupBySwitcher } from './GroupBySwitcher'
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
      <div className="sticky top-[4.25rem] z-10 mb-5 rounded-card border border-border/80 bg-surface/90 p-3 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
          <GroupBySwitcher groupBy={groupBy} onChange={setGroupBy} />
        </div>
      </div>

      <SynergyPanelBody
        groupBy={groupBy}
        byRole={byRole}
        byType={byType}
        picked={picked}
        togglePick={togglePick}
        openCardPreview={openCardPreview}
      />
    </>
  )
}
