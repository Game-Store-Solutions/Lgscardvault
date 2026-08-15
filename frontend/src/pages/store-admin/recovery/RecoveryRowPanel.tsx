import { useEffect, useMemo, useState } from 'react'
import { CircleSlash, RotateCcw, Save } from 'lucide-react'
import { cardImage, extractErrorMessage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary, CsvImportRow } from '../../../api/types'
import { Badge, Button, Input } from '../../../components/ui'
import {
  CONDITIONS,
  ConditionSegmented,
  QuantityStepper,
  type Condition,
} from '../../../components/inventory'
import { CardRecoverySearch } from './CardRecoverySearch'
import { useCardPrintings, useRecoveryActions, type RecoveryFilters } from './useImportRecovery'

export interface RecoveryRowPanelProps {
  slug: string
  importId: string
  row: CsvImportRow
  /** Called after the row is stocked or skipped, so the queue can advance. */
  onResolved: () => void
}

/** Alchemy rows read "A-Guide of Souls"; the paper card is just "Guide of Souls". */
function initialTerm(row: CsvImportRow): string {
  return row.name.trim().replace(/^A-/i, '')
}

function initialFilters(row: CsvImportRow): RecoveryFilters {
  return {
    set: row.set.trim(),
    collectorNumber: row.collectorNumber.trim(),
    rarity: row.rarity.trim(),
    finish: row.isFoil ? 'foil' : 'nonfoil',
  }
}

/**
 * Resolve one failed row: correct what the sheet said, find the real printing,
 * confirm exactly what will be stocked, then move on.
 *
 * Selecting a card deliberately does not import it. The old modal stocked
 * inventory on click, which turned a misclick into a wrong listing the owner
 * had to hunt down later.
 */
export function RecoveryRowPanel({ slug, importId, row, onResolved }: RecoveryRowPanelProps) {
  const [name, setName] = useState(row.name)
  const [set, setSet] = useState(row.set)
  const [collectorNumber, setCollectorNumber] = useState(row.collectorNumber)
  const [quantity, setQuantity] = useState(Math.max(0, row.quantity))
  const [condition, setCondition] = useState<Condition>(
    (CONDITIONS as readonly string[]).includes(row.condition) ? (row.condition as Condition) : 'NM',
  )
  const [term, setTerm] = useState(() => initialTerm(row))
  const [filters, setFilters] = useState<RecoveryFilters>(() => initialFilters(row))
  const [selectedCard, setSelectedCard] = useState<CardSummary | null>(row.card ?? null)
  const [error, setError] = useState<string | null>(null)

  // Re-seed everything when the operator moves to another row.
  useEffect(() => {
    setName(row.name)
    setSet(row.set)
    setCollectorNumber(row.collectorNumber)
    setQuantity(Math.max(0, row.quantity))
    setCondition(
      (CONDITIONS as readonly string[]).includes(row.condition) ? (row.condition as Condition) : 'NM',
    )
    setTerm(initialTerm(row))
    setFilters(initialFilters(row))
    setSelectedCard(row.card ?? null)
    setError(null)
  }, [row])

  const { resolveRow, saveRow, skipRow } = useRecoveryActions(slug, importId)
  const { data: printings = [] } = useCardPrintings(slug, importId, selectedCard?.id ?? null)

  const isFoil = filters.finish === 'foil'
  const isSkipped = row.status === 'skipped'
  const marketPrice = useMemo(
    () => (selectedCard ? formatScryfallPrice(selectedCard, filters.finish) : null),
    [selectedCard, filters.finish],
  )

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(extractErrorMessage(err, fallback))
      return false
    }
  }

  async function addToInventory() {
    if (!selectedCard) return
    const ok = await run(
      () =>
        resolveRow.mutateAsync({
          rowIndex: row.rowIndex,
          cardId: selectedCard.id,
          quantity,
          condition,
          isFoil,
        }),
      'Could not add this card to inventory.',
    )
    if (ok) onResolved()
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-border bg-bg p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Set" value={set} onChange={(e) => setSet(e.target.value)} className="uppercase" />
          <Input
            label="Collector #"
            value={collectorNumber}
            onChange={(e) => setCollectorNumber(e.target.value)}
          />
          <div>
            <p className="mb-1.5 text-sm font-bold text-fg">Quantity</p>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-sm font-bold text-fg">Condition</p>
          <ConditionSegmented value={condition} onChange={setCondition} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={saveRow.isPending}
            onClick={() =>
              void run(
                () =>
                  saveRow.mutateAsync({
                    rowIndex: row.rowIndex,
                    name,
                    set,
                    collectorNumber,
                    quantity,
                    condition,
                    isFoil,
                  }),
                'Could not save this row.',
              )
            }
          >
            <Save aria-hidden className="size-4" />
            Save row edits
          </Button>

          <Button
            variant="secondary"
            size="sm"
            loading={skipRow.isPending}
            onClick={async () => {
              const ok = await run(
                () => skipRow.mutateAsync({ rowIndex: row.rowIndex, skipped: !isSkipped }),
                'Could not update this row.',
              )
              if (ok && !isSkipped) onResolved()
            }}
          >
            {isSkipped ? (
              <>
                <RotateCcw aria-hidden className="size-4" />
                Put back in the queue
              </>
            ) : (
              <>
                <CircleSlash aria-hidden className="size-4" />
                Skip this row
              </>
            )}
          </Button>
        </div>

        {row.error && (
          <p className="mt-3 rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {row.error}
          </p>
        )}
      </div>

      <CardRecoverySearch
        slug={slug}
        importId={importId}
        term={term}
        onTermChange={setTerm}
        filters={filters}
        onFiltersChange={setFilters}
        selectedCardId={selectedCard?.id ?? null}
        onSelect={setSelectedCard}
      />

      {error && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}

      {selectedCard && (
        <div className="sticky bottom-0 space-y-3 rounded-card border border-brand-300 bg-surface p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-4">
            {cardImage(selectedCard) && (
              <img src={cardImage(selectedCard)} alt="" className="h-24 rounded-btn" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-fg">{selectedCard.name}</p>
              <p className="text-xs uppercase tracking-wide text-fg-muted">
                {(selectedCard.setCode ?? '-').toUpperCase()} #{selectedCard.collectorNumber ?? '-'}
              </p>
              {/* Say exactly what is about to happen, so Add is never a guess. */}
              <p className="mt-1.5 text-sm text-fg-muted">
                Stocking <span className="font-bold text-fg">{quantity}</span> ×{' '}
                <span className="font-bold text-fg">{condition}</span>{' '}
                <span className="font-bold text-fg">{isFoil ? 'foil' : 'nonfoil'}</span> at{' '}
                <span className="font-bold text-fg">{marketPrice}</span>
              </p>
            </div>
            <Button loading={resolveRow.isPending} onClick={() => void addToInventory()}>
              Add to inventory
            </Button>
          </div>

          {printings.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-muted">
                Other paper printings
              </p>
              <div className="flex flex-wrap gap-2">
                {printings.slice(0, 10).map((printing) => (
                  <button
                    key={printing.id}
                    type="button"
                    onClick={() => setSelectedCard(printing)}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1 text-xs font-bold text-fg hover:border-brand-400"
                  >
                    {(printing.setCode ?? '-').toUpperCase()} #{printing.collectorNumber ?? '-'}
                    <Badge tone="neutral">{formatScryfallPrice(printing, filters.finish)}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
