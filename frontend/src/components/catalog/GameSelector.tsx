import { useId } from 'react'
import { motion } from 'framer-motion'
import type { CatalogGame } from '../../api/types'
import { FilterPill, Select } from '../ui'
import { useAdminChrome } from '../layout/AdminChromeContext'
import { EASE_PREMIUM } from '../motion'
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
  /** Admin defaults to underline tabs; storefront keeps pills. */
  variant?: 'pills' | 'tabs'
}

/**
 * The one game switcher. Storefront uses pills; the admin console uses
 * underline tabs. Both emit the same value. On small screens both collapse
 * to a select so five-plus games never wrap into a wall.
 */
export function GameSelector({
  games,
  value,
  onChange,
  includeAll = false,
  allLabel = 'All games',
  label = 'Game',
  className,
  variant,
}: GameSelectorProps) {
  const inAdmin = useAdminChrome()
  const resolvedVariant = variant ?? (inAdmin ? 'tabs' : 'pills')
  const indicatorId = useId()
  if (games.length === 0) return null

  const options = [
    ...(includeAll ? [{ code: '', name: allLabel }] : []),
    ...games,
  ]

  return (
    <div className={cx('w-full', className)}>
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

      {resolvedVariant === 'tabs' ? (
        <div role="group" aria-label={label} className="hidden gap-7 border-b border-border sm:flex">
          {options.map((game) => {
            const selected = game.code === value
            return (
              <button
                key={game.code || 'all'}
                type="button"
                onClick={() => onChange(game.code)}
                className={cx(
                  'relative min-h-11 px-0.5 pb-3 pt-1 text-sm font-semibold transition-colors',
                  selected ? 'text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {game.name}
                {selected ? (
                  <motion.span
                    layoutId={`game-tab-indicator-${indicatorId}`}
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-fg"
                    transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : (
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
      )}
    </div>
  )
}

export default GameSelector
