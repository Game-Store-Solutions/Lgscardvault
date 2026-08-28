import { Search } from 'lucide-react'
import type { DeckRole } from '../../hooks'
import { EmptyState, LoadingPanel } from '../../components/ui'
import { cx } from '../../lib/cx'
import { ROLE_META, TYPE_LABELS, TYPE_ORDER } from './constants'
import { PublicSynergyGrid } from './PublicSynergyGrid'
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
  | 'view'
  | 'setView'
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
  view,
  setView,
  picked,
  togglePick,
  openCardPreview,
  byRole,
  byType,
}: PublicSynergyPanelProps) {  if (!strategyId || strategiesQuery.isLoading) {
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
              {packageData?.totalCandidates ?? recommendations.length} color-legal
              candidates
              {pickedOracleIds.length > 0
                ? ` · re-ranked for ${pickedOracleIds.length} pick${pickedOracleIds.length === 1 ? '' : 's'}`
                : ''}
              {nextCards.isFetching ? ' · updating…' : ''}
            </p>
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
          </div>
        </div>
      </div>
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
                <PublicSynergyGrid
                  rows={rows}
                  picked={picked}
                  togglePick={togglePick}
                  openCardPreview={openCardPreview}
                />
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
                <PublicSynergyGrid
                  rows={rows}
                  picked={picked}
                  togglePick={togglePick}
                  openCardPreview={openCardPreview}
                />
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
