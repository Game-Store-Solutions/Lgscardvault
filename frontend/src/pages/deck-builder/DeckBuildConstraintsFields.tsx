import type { Dispatch, SetStateAction } from 'react'
import { Input, Select } from '../../components/ui'
import { parseDeckBuilderBracket } from '../../lib/deckBuilder'
import type { DeckBracket } from './utils'

export function DeckBuildConstraintsFields({
  budgetDollars,
  setBudgetDollars,
  maxCardDollars,
  setMaxCardDollars,
  bracket,
  setBracket,
  includeOutOfStock,
  setIncludeOutOfStock,
  showOutOfStockToggle,
  onOutOfStockChange,
  catalogMode = false,
}: {
  budgetDollars: string
  setBudgetDollars: Dispatch<SetStateAction<string>>
  maxCardDollars: string
  setMaxCardDollars: Dispatch<SetStateAction<string>>
  bracket: DeckBracket
  setBracket: Dispatch<SetStateAction<DeckBracket>>
  includeOutOfStock: boolean
  setIncludeOutOfStock: Dispatch<SetStateAction<boolean>>
  showOutOfStockToggle: boolean
  onOutOfStockChange?: () => void
  catalogMode?: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-fg-muted">
        Caps apply to the 100-card list. Combos stay legal in this commander&apos;s colors.
      </p>
      {showOutOfStockToggle && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-border text-brand-600 focus:ring-brand-500"
            checked={includeOutOfStock}
            onChange={(e) => {
              setIncludeOutOfStock(e.target.checked)
              onOutOfStockChange?.()
            }}
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Include out of stock</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
              Still recommend cards this store does not carry — flagged, not buyable.
            </span>
          </span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Deck budget"
          inputMode="decimal"
          placeholder="500"
          value={budgetDollars}
          onChange={(e) => setBudgetDollars(e.target.value)}
          hint="USD total"
        />
        <Input
          label="Card max"
          inputMode="decimal"
          placeholder="25"
          value={maxCardDollars}
          onChange={(e) => setMaxCardDollars(e.target.value)}
          hint="USD each"
        />
      </div>
      <Select
        label="Commander bracket"
        value={bracket}
        onChange={(e) => setBracket(parseDeckBuilderBracket(e.target.value))}
        hint={
          catalogMode
            ? 'Auto picks a bracket from the full catalog.'
            : 'Auto uses Scryfall Game Changers this store stocks in-identity.'
        }
      >
        <option value="auto">{catalogMode ? 'Auto' : 'Auto from store stock'}</option>
        <option value="1">1 · Exhibition (no Game Changers)</option>
        <option value="2">2 · Core (no Game Changers)</option>
        <option value="3">3 · Upgraded (up to 3 Game Changers)</option>
        <option value="4">4 · Optimized</option>
        <option value="5">5 · cEDH</option>
      </Select>
    </div>
  )
}
