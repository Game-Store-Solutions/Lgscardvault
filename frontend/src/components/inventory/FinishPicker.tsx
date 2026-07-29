import { Sparkles } from 'lucide-react'
import { cx } from '../../lib/cx'
import { FOIL_GRADIENT } from '../../lib/mtg'
import { isFoilFinish, type FinishOption } from '../../lib/finishes'

export interface FinishPickerProps {
  value: string
  options: FinishOption[]
  onChange: (finish: string) => void
  disabled?: boolean
}

/**
 * Picks which treatment a listing is for, from the ones the printing is
 * actually sold in.
 *
 * This replaced a foil on/off switch. A Pokemon card is printed Normal,
 * Holofoil AND Reverse Holofoil — three separately priced things a switch
 * could not express, and which used to collapse onto one listing.
 */
export function FinishPicker({ value, options, onChange, disabled }: FinishPickerProps) {
  // Past three treatments the buttons stop fitting a column; the native
  // control also gives mobile a proper picker.
  if (options.length > 3) {
    return (
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Finish"
        className="h-11 w-full rounded-btn border border-border bg-surface px-3 text-sm font-bold text-fg disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div role="radiogroup" aria-label="Finish" className="flex gap-2">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn border px-3 text-sm font-bold transition-colors disabled:opacity-50',
              active
                ? option.isFoil
                  ? 'border-transparent text-black/80'
                  : 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-border bg-surface text-fg-muted hover:text-fg',
            )}
            style={active && option.isFoil ? { backgroundImage: FOIL_GRADIENT } : undefined}
          >
            {isFoilFinish(option.value) && <Sparkles aria-hidden className="size-4 opacity-90" />}
            {option.value}
          </button>
        )
      })}
    </div>
  )
}

export default FinishPicker
