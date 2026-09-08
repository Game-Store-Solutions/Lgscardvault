import { ChevronLeft, Plus } from 'lucide-react'
import type { CardSummary } from '../../../api/types'
import { Button, Input } from '../../../components/ui'
import { plainCardText } from '../../../lib/cardText'
import { finishOptions, isFoilFinish } from '../../../lib/finishes'
import { listingMarketSummary } from '../../../lib/marketFinishes'
import { ConditionSegmented, FinishPicker, QuantityStepper, type Condition } from '../../../components/inventory'

export interface SelectedCardEditorProps {
  card: CardSummary
  quantity: number
  condition: Condition
  finish: string
  pending: boolean
  costText: string
  /** Sell price in dollars; seeded from market price when one exists. */
  priceText: string
  onPriceChange: (value: string) => void
  onCostChange: (value: string) => void
  onQuantityChange: (value: number) => void
  onConditionChange: (value: Condition) => void
  onFinishChange: (finish: string) => void
  onAdd: () => void
  /** Return to the printing picker without running search again. */
  onBack?: () => void
  backLabel?: string
}

/** Draft editor for the printing selected from catalog search, before adding it. */
export function SelectedCardEditor({
  card,
  quantity,
  condition,
  finish,
  pending,
  costText,
  priceText,
  onPriceChange,
  onCostChange,
  onQuantityChange,
  onConditionChange,
  onFinishChange,
  onAdd,
  onBack,
  backLabel = 'Back to printings',
}: SelectedCardEditorProps) {
  // Every treatment this printing is sold in, from the game's own catalog:
  // "Normal / Holofoil / Reverse Holofoil", not Magic's two.
  const finishes = finishOptions(card)
  const isMagic = (card.gameCode ?? 'mtg') === 'mtg'
  const market = listingMarketSummary(card, isFoilFinish(finish), finish)
  const marketPrice = market.priceCents != null ? market.display : '—'
  const hasMarketPrice = market.priceCents != null
  return (
    <div className="rounded-card border border-border bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-500"
            >
              <ChevronLeft className="size-4" aria-hidden />
              {backLabel}
            </button>
          )}
          <h3 className="font-bold text-fg">{card.name}</h3>
          <p className="text-sm text-fg-muted">
            {(card.setCode ?? '---').toUpperCase()} #{card.collectorNumber ?? '---'}
            {card.setName ? ` · ${card.setName}` : ''}
          </p>
        </div>
        <p className="text-xs uppercase text-fg-muted">
          {finishes.map((option) => option.value).join(' / ')}
        </p>
      </div>

      <div className="mt-4 grid gap-3 rounded-card border border-border bg-surface p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Market price" value={marketPrice} />
        {isMagic && card.manaCost && <Meta label="Mana cost" value={card.manaCost} />}
        {card.typeLine && <Meta label="Type" value={card.typeLine} />}
        {card.rarity && <Meta label="Rarity" value={card.rarity} />}
        {card.power && <Meta label="Power" value={card.power} />}
        {card.releasedAt && <Meta label="Released" value={card.releasedAt} />}
        {card.artist && <Meta label="Artist" value={card.artist} />}
        {card.oracleText && (
          // Rules text is multi-line; preserve the line breaks it arrives with.
          <p className="whitespace-pre-line text-fg sm:col-span-2 lg:col-span-4">{plainCardText(card.oracleText)}</p>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-bold text-fg">Quantity</p>
          <QuantityStepper value={quantity} onChange={onQuantityChange} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-fg">Finish</p>
          {finishes.length > 1 ? (
            <FinishPicker value={finish} options={finishes} onChange={onFinishChange} />
          ) : (
            <p className="flex h-11 items-center rounded-btn border border-border bg-surface px-3 text-sm font-bold text-fg">
              {finishes[0]?.value ?? finish}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-bold text-fg">Condition</p>
          <ConditionSegmented value={condition} onChange={onConditionChange} />
        </div>
        <div>
          <Input
            label="Sell price ($)"
            value={priceText}
            onChange={(e) => onPriceChange(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            hint={
              hasMarketPrice
                ? `Market price ${marketPrice}. Edit to override`
                : 'No market price for this card yet. Set your own'
            }
          />
        </div>
        <div>
          <Input
            label="Your cost per copy ($, optional)"
            value={costText}
            onChange={(e) => onCostChange(e.target.value)}
            inputMode="decimal"
            placeholder="What you paid. Powers profit reports"
          />
        </div>
      </div>

      <div className="mt-4">
        <Button onClick={onAdd} loading={pending}>
          <Plus className="size-4" aria-hidden />
          Add {card.name}
        </Button>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-fg-muted">{label}</p>
      <p className="font-bold text-fg">{value}</p>
    </div>
  )
}

export default SelectedCardEditor
