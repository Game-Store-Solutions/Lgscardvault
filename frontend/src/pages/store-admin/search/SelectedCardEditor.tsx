import { Plus } from 'lucide-react'
import { formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Button, Input } from '../../../components/ui'
import { plainCardText } from '../../../lib/cardText'
import { finishChoices } from '../../../lib/finishes'
import { ConditionSegmented, FinishToggle, QuantityStepper, type Condition } from '../../../components/inventory'

export interface SelectedCardEditorProps {
  card: CardSummary
  quantity: number
  condition: Condition
  isFoil: boolean
  pending: boolean
  costText: string
  /** Sell price in dollars; seeded from market price when one exists. */
  priceText: string
  onPriceChange: (value: string) => void
  onCostChange: (value: string) => void
  onQuantityChange: (value: number) => void
  onConditionChange: (value: Condition) => void
  onFinishChange: (value: 'nonfoil' | 'foil') => void
  onAdd: () => void
}

/** Draft editor for the printing selected from catalog search, before adding it. */
export function SelectedCardEditor({
  card,
  quantity,
  condition,
  isFoil,
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
  // Finish labels come from the game's own catalog, so a Pokemon card offers
  // "Normal / Holofoil" rather than Magic's "Nonfoil / Foil".
  const finishes = finishChoices(card)
  const onlyFoil = finishes.hasFoil && !finishes.hasPlain
  const onlyNonfoil = finishes.hasPlain && !finishes.hasFoil
  // Mana cost is a Magic concept; showing it (empty) on a One Piece leader is
  // noise. Games outside Magic get the attributes they actually have.
  const isMagic = (card.gameCode ?? 'mtg') === 'mtg'
  const marketPrice = formatScryfallPrice(card, isFoil ? 'foil' : 'nonfoil')
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
          {(card.finishes?.length ? card.finishes : [finishes.plain]).join(' / ')}
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
          <FinishToggle
            value={isFoil}
            onChange={(v) => onFinishChange(v ? 'foil' : 'nonfoil')}
            disabled={Boolean(onlyFoil || onlyNonfoil)}
            labels={{ plain: finishes.plain, foil: finishes.foil }}
          />
          {finishes.extras.length > 0 && (
            // Inventory stores one plain and one foil line per printing, so
            // these treatments have no listing of their own yet.
            <p className="mt-1 text-xs text-fg-muted">
              Also printed as {finishes.extras.join(', ')} — stocked under {finishes.foil} for now.
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
