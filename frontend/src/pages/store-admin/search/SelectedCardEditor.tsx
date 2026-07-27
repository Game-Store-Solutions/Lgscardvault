import { Plus } from 'lucide-react'
import { formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Button, Input } from '../../../components/ui'
import { ConditionSegmented, FoilToggle, QuantityStepper, type Condition } from '../../../components/inventory'

export interface SelectedCardEditorProps {
  card: CardSummary
  quantity: number
  condition: Condition
  isFoil: boolean
  pending: boolean
  costText: string
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
  onCostChange,
  onQuantityChange,
  onConditionChange,
  onFinishChange,
  onAdd,
}: SelectedCardEditorProps) {
  const onlyFoil = card.finishes?.includes('foil') && !card.finishes?.includes('nonfoil')
  const onlyNonfoil = card.finishes?.includes('nonfoil') && !card.finishes?.includes('foil')
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
          {(card.finishes?.length ? card.finishes : ['nonfoil']).join(' / ')}
        </p>
      </div>

      <div className="mt-4 grid gap-3 rounded-card border border-border bg-surface p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Market price" value={formatScryfallPrice(card, isFoil ? 'foil' : 'nonfoil')} />
        <Meta label="Mana cost" value={card.manaCost || '-'} />
        <Meta label="Released" value={card.releasedAt || '-'} />
        <Meta label="Artist" value={card.artist || '-'} />
        {card.oracleText && <p className="text-fg sm:col-span-2 lg:col-span-4">{card.oracleText}</p>}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-bold text-fg">Quantity</p>
          <QuantityStepper value={quantity} onChange={onQuantityChange} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-fg">Finish</p>
          <FoilToggle
            value={isFoil}
            onChange={(v) => onFinishChange(v ? 'foil' : 'nonfoil')}
            disabled={Boolean(onlyFoil || onlyNonfoil)}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-bold text-fg">Condition</p>
          <ConditionSegmented value={condition} onChange={onConditionChange} />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="Your cost per copy ($, optional)"
            value={costText}
            onChange={(e) => onCostChange(e.target.value)}
            inputMode="decimal"
            placeholder="What you paid — powers profit reports"
          />
        </div>
        <div className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 sm:col-span-2">
          <span className="text-sm text-fg-muted">Market price — applied automatically on add</span>
          <span className="font-display text-xl font-bold text-fg">
            {formatScryfallPrice(card, isFoil ? 'foil' : 'nonfoil')}
          </span>
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
