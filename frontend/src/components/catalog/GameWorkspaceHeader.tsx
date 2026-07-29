import { Boxes, Layers, Package } from 'lucide-react'
import type { CatalogGame, StoreGameStats } from '../../api/types'
import { GameSelector } from './GameSelector'
import { Card, CardBody } from '../ui'
import { cx } from '../../lib/cx'

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
      <CardBody className="space-y-4 py-4">
        <GameSelector games={games} value={value} onChange={onChange} label={label} />

        {activeGame && (
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-fg">{activeGame.name}</h2>
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              <Stat
                icon={Layers}
                label="Singles"
                value={stats?.singles.listings}
                sub={stats ? `${NUMBER.format(stats.singles.copies)} copies` : undefined}
                loading={loading}
              />
              <Stat
                icon={Package}
                label="Sealed products"
                value={stats?.sealed.products}
                sub={stats ? `${NUMBER.format(stats.sealed.units)} units` : undefined}
                loading={loading}
              />
              <Stat
                icon={Boxes}
                label="Total inventory"
                value={stats?.total.listings}
                sub={stats ? `${NUMBER.format(stats.total.copies)} items on hand` : undefined}
                loading={loading}
                emphasis
              />
            </dl>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  emphasis = false,
}: {
  icon: typeof Layers
  label: string
  value?: number
  sub?: string
  loading?: boolean
  emphasis?: boolean
}) {
  return (
    <div
      className={cx(
        'rounded-card border px-4 py-3',
        emphasis ? 'border-brand-300 bg-brand-50' : 'border-border bg-bg',
      )}
    >
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg-muted">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1">
        <span className="font-display text-2xl font-extrabold text-fg">
          {loading || undefined === value ? '—' : NUMBER.format(value)}
        </span>
        {sub && <span className="ml-2 text-xs text-fg-muted">{sub}</span>}
      </dd>
    </div>
  )
}

export default GameWorkspaceHeader
