import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { CircleSlash, RotateCcw, Search } from 'lucide-react'
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
import { cx } from '../../../lib/cx'
import { CardRecoverySearch } from './CardRecoverySearch'
import { recoveryJob, recoveryJobCopy } from './recoveryJob'
import { shortRowReason } from './shortReason'
import { isStockableRecoveryCard } from './stockableCard'
import { useCardPrintings, useRecoveryActions, type RecoveryFilters } from './useImportRecovery'

export interface RecoveryRowPanelProps {
  slug: string
  importId: string
  row: CsvImportRow
  similarRows: CsvImportRow[]
  onResolved: () => void
}

export interface RecoveryRowPanelHandle {
  confirm: () => void
  skip: () => void
  pickResult: (index: number) => void
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

function startingQuantity(row: CsvImportRow): number {
  return row.quantity > 0 ? row.quantity : 1
}

/**
 * One failed row. The body changes with the failure: quantity, missing price,
 * no match, or online-only. Search is an escape hatch, not the default screen.
 */
export const RecoveryRowPanel = forwardRef<RecoveryRowPanelHandle, RecoveryRowPanelProps>(
  function RecoveryRowPanel({ slug, importId, row, similarRows, onResolved }, ref) {
    const job = recoveryJob(row)
    const copy = recoveryJobCopy(job)
    const seedCard = row.card ?? null

    const [name, setName] = useState(row.name)
    const [set, setSet] = useState(row.set)
    const [collectorNumber, setCollectorNumber] = useState(row.collectorNumber)
    const [quantity, setQuantity] = useState(() => startingQuantity(row))
    const [condition, setCondition] = useState<Condition>(
      (CONDITIONS as readonly string[]).includes(row.condition) ? (row.condition as Condition) : 'NM',
    )
    const [term, setTerm] = useState(() => initialTerm(row))
    const [filters, setFilters] = useState<RecoveryFilters>(() => initialFilters(row))
    const [selectedCard, setSelectedCard] = useState<CardSummary | null>(() =>
      seedCard && isStockableRecoveryCard(seedCard, initialFilters(row).finish) ? seedCard : null,
    )
    const [searchResults, setSearchResults] = useState<CardSummary[]>([])
    const [error, setError] = useState<string | null>(null)
    const [editingSheet, setEditingSheet] = useState(() => job === 'quantity' && !seedCard)
    const [showSearch, setShowSearch] = useState(() => job === 'match' || job === 'other')
    const [applySimilar, setApplySimilar] = useState(true)

    useEffect(() => {
      const nextJob = recoveryJob(row)
      setName(row.name)
      setSet(row.set)
      setCollectorNumber(row.collectorNumber)
      setQuantity(startingQuantity(row))
      setCondition(
        (CONDITIONS as readonly string[]).includes(row.condition) ? (row.condition as Condition) : 'NM',
      )
      setTerm(initialTerm(row))
      setFilters(initialFilters(row))
      setError(null)
      setEditingSheet(nextJob === 'quantity' && !row.card)
      setShowSearch(nextJob === 'match' || nextJob === 'other')
      setApplySimilar(true)
      setSearchResults([])
      const finish = row.isFoil ? 'foil' : 'nonfoil'
      setSelectedCard(row.card && isStockableRecoveryCard(row.card, finish) ? row.card : null)
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
    const pricedPrintings = useMemo(
      () => printings.filter((printing) => isStockableRecoveryCard(printing, filters.finish)),
      [printings, filters.finish],
    )
    const pickList = searchResults.length > 0 ? searchResults : pricedPrintings
    const similarCount = similarRows.length

    useEffect(() => {
      if (selectedCard) return
      const priced = pricedPrintings[0]
      if (priced) setSelectedCard(priced)
    }, [pricedPrintings, selectedCard])

    const handleResults = useCallback((items: CardSummary[]) => {
      setSearchResults(items)
    }, [])

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
      const targets = applySimilar && similarCount > 0 ? [row, ...similarRows] : [row]
      const ok = await run(async () => {
        for (const target of targets) {
          await resolveRow.mutateAsync({
            rowIndex: target.rowIndex,
            cardId: selectedCard.id,
            quantity: target.rowIndex === row.rowIndex ? quantity : startingQuantity(target),
            condition: target.rowIndex === row.rowIndex ? condition : (target.condition as Condition),
            isFoil,
          })
        }
      }, 'Could not add this card to inventory.')
      if (ok) onResolved()
    }

    async function skipCurrent() {
      const ok = await run(
        () => skipRow.mutateAsync({ rowIndex: row.rowIndex, skipped: !isSkipped }),
        'Could not update this row.',
      )
      if (ok && !isSkipped) onResolved()
    }

    useImperativeHandle(ref, () => ({
      confirm: () => {
        if (job === 'online' && !canStockSelected) {
          void skipCurrent()
          return
        }
        void addToInventory()
      },
      skip: () => {
        void skipCurrent()
      },
      pickResult: (index: number) => {
        const card = pickList[index]
        if (card) setSelectedCard(card)
      },
    }))

    const confirmLabel =
      job === 'online' && !canStockSelected
        ? 'Skip'
        : similarCount > 0 && applySimilar
          ? `Add ${similarCount + 1} to inventory`
          : 'Add to inventory'

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
            <p className="mt-2 text-sm text-fg-muted">{copy.hint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {job !== 'match' && job !== 'other' && (
              <Button variant="ghost" size="sm" onClick={() => setShowSearch((open) => !open)}>
                <Search aria-hidden className="size-4" />
                {showSearch ? 'Hide search' : 'Find printing'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setEditingSheet((open) => !open)}>
              {editingSheet ? 'Hide sheet' : 'Edit sheet'}
            </Button>
            <Button variant="secondary" size="sm" loading={skipRow.isPending} onClick={() => void skipCurrent()}>
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
          {job === 'quantity' && seedCard && !showSearch && (
            <MatchedCardPreview card={seedCard} finish={filters.finish} />
          )}

          {job === 'price' && !showSearch && (
            <PrintingPicker
              printings={pricedPrintings}
              selectedId={selectedCard?.id ?? null}
              finish={filters.finish}
              onSelect={setSelectedCard}
              empty="No priced printing of this card. Find another printing, or skip."
            />
          )}

          {job === 'online' && !showSearch && (
            <div className="space-y-4">
              <p className="rounded-card border border-border bg-bg/70 px-4 py-3 text-sm text-fg">
                This looks like an Alchemy or Arena-only printing. Skip it, or pick the paper version below.
              </p>
              <PrintingPicker
                printings={pricedPrintings}
                selectedId={selectedCard?.id ?? null}
                finish={filters.finish}
                onSelect={setSelectedCard}
                empty="No paper printing in the catalog for this name."
              />
            </div>
          )}

          {(job === 'match' || job === 'other' || showSearch) && (
            <CardRecoverySearch
              slug={slug}
              importId={importId}
              term={term}
              onTermChange={setTerm}
              filters={filters}
              onFiltersChange={setFilters}
              selectedCardId={selectedCard?.id ?? null}
              onSelect={setSelectedCard}
              onResultsChange={handleResults}
            />
          )}

          {error && (
            <p role="alert" className="mt-4 text-sm text-danger-700">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-bg/60 px-6 py-4">
          {selectedCard ? (
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
                {similarCount > 0 && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      checked={applySimilar}
                      onChange={(e) => setApplySimilar(e.target.checked)}
                    />
                    Also add {similarCount} similar {similarCount === 1 ? 'row' : 'rows'}
                  </label>
                )}
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
                {confirmLabel}
              </Button>
            </div>
          ) : job === 'online' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-fg-muted">No paper printing selected.</p>
              <Button loading={skipRow.isPending} onClick={() => void skipCurrent()}>
                Skip this row
              </Button>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">Pick a stockable printing to add it. Enter confirms · S skips.</p>
          )}
        </div>
      </div>
    )
  },
)

function MatchedCardPreview({ card, finish }: { card: CardSummary; finish: 'foil' | 'nonfoil' }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-bg/70 p-4">
      <CardImage
        src={cardImage(card)}
        alt={card.name}
        fit="contain"
        showLabel={false}
        className="h-36 w-[6.5rem] shrink-0 rounded-btn"
      />
      <div className="min-w-0">
        <p className="font-display text-lg font-bold text-fg">{card.name}</p>
        <p className="mt-1 text-sm text-fg-muted">
          {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </p>
        <p className="mt-3 font-display text-xl font-bold text-fg">{formatScryfallPrice(card, finish)}</p>
      </div>
    </div>
  )
}

function PrintingPicker({
  printings,
  selectedId,
  finish,
  onSelect,
  empty,
}: {
  printings: CardSummary[]
  selectedId: string | null
  finish: 'foil' | 'nonfoil'
  onSelect: (card: CardSummary) => void
  empty: string
}) {
  if (printings.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
        {empty}
      </p>
    )
  }

  return (
    <div className={cx('grid gap-3', printings.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2')}>
      {printings.slice(0, 8).map((card, index) => {
        const selected = card.id === selectedId
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card)}
            className={cx(
              'flex items-center gap-4 rounded-card border p-3 text-left transition-colors',
              selected
                ? 'border-fg/30 bg-bg shadow-sm ring-1 ring-fg/15'
                : 'border-border bg-surface hover:border-fg/20 hover:bg-bg',
            )}
          >
            {index < 6 && (
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-btn border border-border text-[11px] font-bold text-fg-muted"
              >
                {index + 1}
              </span>
            )}
            <CardImage
              src={cardImage(card)}
              alt={card.name}
              fit="contain"
              showLabel={false}
              className="h-24 w-[4.5rem] shrink-0 rounded-btn"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-bold leading-snug text-fg">{card.name}</span>
              <span className="mt-1 block text-xs uppercase tracking-wide text-fg-muted">
                {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
              </span>
              <span className="mt-2 block font-display text-base font-bold text-fg">
                {formatScryfallPrice(card, finish)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
