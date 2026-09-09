import { Minus, Plus } from 'lucide-react'

export interface QuantityStepperProps {
  value: number
  onChange: (v: number) => void
}

/** Quantity stepper — − / value / + with a non-negative integer. */
export function QuantityStepper({ value, onChange }: QuantityStepperProps) {
  return (
    <div className="inline-flex h-11 items-stretch overflow-hidden rounded-btn border border-border bg-surface">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease quantity"
        className="grid w-11 place-items-center text-fg-muted transition-colors hover:bg-bg hover:text-fg"
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        aria-label="Quantity"
        className="w-14 border-x border-border bg-surface text-center text-sm font-bold text-fg [appearance:textfield] focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
        className="grid w-11 place-items-center text-fg-muted transition-colors hover:bg-bg hover:text-fg"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  )
}

export default QuantityStepper
