import { useEffect, useMemo, useState } from 'react'
import { CircleSlash, RotateCcw } from 'lucide-react'
import { cardImage, extractErrorMessage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary, CsvImportRow } from '../../../api/types'
import { Badge, Button, Input } from '../../../components/ui'
import { CardImage } from '../../../components/cards'
import {
  CONDITIONS,
  ConditionSegmented,
  QuantityStepper,
  type Condition,
} from '../../../components/inventory'
import { CardRecoverySearch } from './CardRecoverySearch'
import { shortRowReason } from './shortReason'
import { isStockableRecoveryCard } from './stockableCard'
import { useCardPrintings, useRecoveryActions, type RecoveryFilters } from './useImportRecovery'

export interface RecoveryRowPanelProps {
  slug: string
  importId: string
  row: CsvImportRow
  onResolved: () => void
}

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

function reasonTone(error?: string | null): 'warning' | 'danger' | 'neutral' {
  const text = (error ?? '').toLowerCase()
  if (text.includes('quantity')) return 'danger'
  if (text.includes('market price') || text.includes('no match') || text.includes('not found')) return 'warning'
  return 'neutral'
}

/**
 * One failed row: pick a stockable printing, confirm qty/condition, move on.
 * Sheet-field editing stays behind a disclosure — most recoveries never need it.
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
  const seedCard = row.card ?? null
  const [selectedCard, setSelectedCard] = useState<CardSummary | null>(() =>
    seedCard && isStockableRecoveryCard(seedCard, initialFilters(row).finish) ? seedCard : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [editingSheet, setEditingSheet] = useState(() => /quantity/i.test(row.error ?? ''))

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
    setError(null)
    setEditingSheet(/quantity/i.test(row.error ?? ''))
  }, [row])

  const { resolveRow, saveRow, skipRow } = useRecoveryActions(slug, importId)
  const printingsCardId = selectedCard?.id ?? seedCard?.id ?? null
  const { data: printings = [] } = useCardPrintings(slug, importId, printingsCardId)

  const isFoil = filters.finish === 'foil'
  const isSkipped = row.status === 'skipped'
  const canStockSelected = selectedCard ? isStockableRecoveryCard(selectedCard, filters.finish) : false
  const marketPrice = useMemo(
    () => (selectedCard ? formatScryfallPrice(selectedCard, filters.finish) : null),
    [selectedCard, filters.finish],
  )
  const reason = shortRowReason(row.error)

  useEffect(() => {
    if (selectedCard) return
    const priced = printings.find((printing) => isStockableRecoveryCard(printing, filters.finish))
    if (priced) setSelectedCard(priced)
  }, [printings, selectedCard, filters.finish])

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
    if (!selectedCard || !canStockSelected) return
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
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold leading-tight text-fg">{row.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.set && <Badge>{row.set.toUpperCase()}</Badge>}
            {row.collectorNumber && <Badge>#{row.collectorNumber}</Badge>}
            <Badge tone={reasonTone(row.error)} title={row.error ?? undefined}>
              {reason}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditingSheet((open) => !open)}>
            {editingSheet ? 'Hide sheet' : 'Edit sheet'}
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
                Restore
              </>
            ) : (
              <>
                <CircleSlash aria-hidden className="size-4" />
                Skip
              </>
            )}
          </Button>
        </div>
      </header>

      {editingSheet && (
        <div className="shrink-0 grid gap-3 border-b border-border bg-bg/50 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Set" value={set} onChange={(e) => setSet(e.target.value)} className="uppercase" />
          <Input
            label="Collector #"
            value={collectorNumber}
            onChange={(e) => setCollectorNumber(e.target.value)}
          />
          <div className="flex items-end">
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
              Save sheet
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
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
          <p role="alert" className="mt-4 text-sm text-danger-700">
            {error}
          </p>
        )}
      </div>

      {selectedCard && (
        <div className="shrink-0 border-t border-border bg-bg/60 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <CardImage
              src={cardImage(selectedCard)}
              alt={selectedCard.name}
              fit="contain"
              showLabel={false}
              className="h-[4.5rem] w-12 rounded-btn"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-fg">{selectedCard.name}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {(selectedCard.setCode ?? '-').toUpperCase()} #{selectedCard.collectorNumber ?? '-'}
                <span className="mx-1.5 text-border">·</span>
                <span className="font-semibold text-fg">{marketPrice}</span>
              </p>
            </div>
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <div className="w-52 shrink-0">
              <ConditionSegmented value={condition} onChange={setCondition} />
            </div>
            <Button
              loading={resolveRow.isPending}
              disabled={!canStockSelected}
              onClick={() => void addToInventory()}
            >
              Add to inventory
            </Button>
          </div>

          {printings.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {printings.slice(0, 8).map((printing) => (
                <button
                  key={printing.id}
                  type="button"
                  onClick={() => setSelectedCard(printing)}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-fg-muted hover:border-brand-400 hover:text-fg"
                >
                  {(printing.setCode ?? '-').toUpperCase()} #{printing.collectorNumber ?? '-'}{' '}
                  {formatScryfallPrice(printing, filters.finish)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
