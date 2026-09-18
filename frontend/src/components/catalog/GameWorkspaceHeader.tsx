import type { CatalogGame, StoreGameStats } from '../../api/types'
import { GameSelector } from './GameSelector'
import { Card, CardBody } from '../ui'

export interface GameWorkspaceHeaderProps {
  games: Pick<CatalogGame, 'code' | 'name'>[]
  value: string
  onChange: (code: string) => void
  stats?: StoreGameStats
  loading?: boolean
  /** Nav label, e.g. "Manage inventory for". */
  label?: string
}

const NUMBER = new Intl.NumberFormat()

/**
 * The top of every per-game admin page: navigation between games, then the
 * selected game's own numbers.
 *
 * Counts live here rather than on the nav pills deliberately. A single
 * number beside a game name can't say whether it means singles, sealed,
 * listings, or copies — and once a store carries both kinds of stock it is
 * actively misleading. Navigation stays navigation; the numbers get room to
 * label themselves.
 */
export function GameWorkspaceHeader({
  games,
  value,
  onChange,
  stats,
  loading = false,
  label = 'Manage inventory for',
}: GameWorkspaceHeaderProps) {
  const activeGame = games.find((game) => game.code === value)

  return (
    <Card>
      <CardBody className="space-y-5 px-6 py-5">
        <GameSelector games={games} value={value} onChange={onChange} label={label} />

        {activeGame && (
          <div>
            <h2 className="font-display text-base font-bold tracking-tight text-fg sm:hidden">{activeGame.name}</h2>
            <dl className="flex flex-wrap gap-x-12 gap-y-3 sm:pt-0">
              <Stat label="Singles" value={stats?.singles.listings} loading={loading} />
              <Stat label="Sealed products" value={stats?.sealed.units} loading={loading} />
            </dl>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Stat({
  label,
  value,
  loading,
}: {
  label: string
  value?: number
  loading?: boolean
}) {
  return (
    <div>
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-fg-muted">{label}</dt>
      <dd className="mt-1 font-display text-xl font-bold tabular-nums text-fg">
        {loading || undefined === value ? '—' : NUMBER.format(value)}
      </dd>
    </div>
  )
}

export default GameWorkspaceHeader
