import type { CatalogGame } from '../../api/types'
import { FilterPill, Select } from '../ui'
import { cx } from '../../lib/cx'

/**
 * Deliberately name-only: a count on a navigation pill can't say what it
 * counts (listings? copies? sealed?). Per-game numbers belong in the
 * workspace stats header, where they can be labeled.
 */
export type GameOption = Pick<CatalogGame, 'code' | 'name'>

export interface GameSelectorProps {
  games: GameOption[]
  /** Selected game code; '' means the All option (when allowed). */
  value: string
  onChange: (code: string) => void
  /** Show an "All games" choice. Off for surfaces that must pick one game. */
  includeAll?: boolean
  allLabel?: string
  /** Accessible name for the control (each instance needs its own). */
  label?: string
  className?: string
}

/**
 * The one game switcher, shared by the storefront and the admin portal so
 * both read the same way.
 *
 * Responsive by construction rather than by breakpoint guesswork: pills on
 * a wide screen (fast, everything visible at once) collapse to a compact
 * custom select on small screens, where a row of five-plus pills would either wrap
 * into a wall or scroll sideways. Both render the same options and emit the
 * same value.
 */
export function GameSelector({
  games,
  value,
  onChange,
  includeAll = false,
  allLabel = 'All games',
  label = 'Game',
  className,
}: GameSelectorProps) {
  if (games.length === 0) return null

  return (
    <div className={cx('w-full', className)}>
      {/* Mobile: a compact picker. Reliable, no horizontal scrolling. */}
      <label className="block sm:hidden">
        <span className="sr-only">{label}</span>
        <Select value={value} onChange={(event) => onChange(event.target.value)} wrapperClassName="w-full" className="w-full">
          {includeAll && <option value="">{allLabel}</option>}
          {games.map((game) => (
            <option key={game.code} value={game.code}>
              {game.name}
            </option>
          ))}
        </Select>
      </label>

      {/* Desktop: pills, so switching games is one click. */}
      <div role="group" aria-label={label} className="hidden flex-wrap gap-2 sm:flex">
        {includeAll && (
          <FilterPill active={'' === value} onClick={() => onChange('')}>
            {allLabel}
          </FilterPill>
        )}
        {games.map((game) => (
          <FilterPill key={game.code} active={value === game.code} onClick={() => onChange(game.code)}>
            {game.name}
          </FilterPill>
        ))}
      </div>
    </div>
  )
}

export default GameSelector
