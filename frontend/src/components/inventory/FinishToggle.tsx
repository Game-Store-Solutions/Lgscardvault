import { Sparkles } from 'lucide-react'
import { cx } from '../../lib/cx'
import { FOIL_GRADIENT } from '../../lib/mtg'

export interface FinishToggleProps {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  /**
   * What this game calls its two printings. Defaults to Magic's wording for
   * callers that have no card in hand.
   */
  labels?: { plain: string; foil: string }
}

/**
 * Finish switch (binary, immediate).
 *
 * The axis is foil / not foil because that is what inventory stores, but the
 * words come from the game: a Pokemon card reads "Holofoil", not "Foil".
 */
export function FinishToggle({ value, onChange, disabled, labels }: FinishToggleProps) {
  const plain = labels?.plain ?? 'Nonfoil'
  const foil = labels?.foil ?? 'Foil'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={`Finish: ${value ? foil : plain}`}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cx(
        'relative inline-flex h-11 w-full items-center justify-between rounded-btn border px-3 text-sm font-bold transition-colors disabled:opacity-50',
        value ? 'border-transparent text-black/80' : 'border-border bg-surface text-fg-muted',
      )}
      style={value ? { backgroundImage: FOIL_GRADIENT } : undefined}
    >
      <span className="inline-flex items-center gap-1.5">
        <Sparkles aria-hidden className={cx('size-4', value ? 'opacity-90' : 'opacity-40')} />
        {value ? foil : plain}
      </span>
      <span className="grid size-6 place-items-center rounded-full bg-white shadow">
        <span className={cx('size-2.5 rounded-full', value ? 'bg-brand-500' : 'bg-border')} />
      </span>
    </button>
  )
}

export default FinishToggle
