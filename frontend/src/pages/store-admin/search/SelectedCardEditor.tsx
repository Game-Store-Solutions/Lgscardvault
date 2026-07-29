import { Plus } from 'lucide-react'
import { formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Button, Input } from '../../../components/ui'
import { plainCardText } from '../../../lib/cardText'
import { finishOptions, isFoilFinish } from '../../../lib/finishes'
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
}: SelectedCardEditorProps) {
  // Every treatment this printing is sold in, from the game's own catalog:
  // "Normal / Holofoil / Reverse Holofoil", not Magic's two.
  const finishes = finishOptions(card)
  // Mana cost is a Magic concept; showing it (empty) on a One Piece leader is
  // noise. Games outside Magic get the attributes they actually have.
  const isMagic = (card.gameCode ?? 'mtg') === 'mtg'
  const marketPrice = formatScryfallPrice(card, isFoilFinish(finish) ? 'foil' : 'nonfoil')
  const hasMarketPrice = marketPrice !== '-'
  return (
    <div className="rounded-card border border-border bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
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
          <FinishPicker value={finish} options={finishes} onChange={onFinishChange} />
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
                ? `Market price ${marketPrice} — edit to override`
                : 'No market price for this card yet — set your own'
            }
          />
        </div>
        <div>
          <Input
            label="Your cost per copy ($, optional)"
            value={costText}
            onChange={(e) => onCostChange(e.target.value)}
            inputMode="decimal"
            placeholder="What you paid — powers profit reports"
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
