import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { CircleSlash, RotateCcw, Search } from 'lucide-react'
import { cardImage, extractErrorMessage, formatPrice, formatScryfallPrice, parsePriceInput, scryfallPriceCents } from '../../../api/client'
import type { CardSummary, CsvImportRow } from '../../../api/types'
import { Badge, Button, Input, Spinner } from '../../../components/ui'
import { CardImage } from '../../../components/cards'
import {
  CONDITIONS,
  ConditionSegmented,
  QuantityStepper,
  type Condition,
} from '../../../components/inventory'
import { CardRecoverySearch } from './CardRecoverySearch'
import { PrintingGrid } from './PrintingGrid'
import { recoveryJob, recoveryJobCopy } from './recoveryJob'
import { shortRowReason } from './shortReason'
import { isPaperRecoveryCard, isStockableRecoveryCard } from './stockableCard'
import { useCardPrintings, useRecoveryActions, useRecoverySearch, type RecoveryFilters } from './useImportRecovery'

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

function startingPriceText(row: CsvImportRow): string {
  return row.priceCents && row.priceCents > 0 ? (row.priceCents / 100).toFixed(2) : ''
}

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function marketCentsFor(card: CardSummary, finish: 'foil' | 'nonfoil'): number | null {
  const cents = scryfallPriceCents(card, finish)
  return cents && cents > 0 ? cents : null
}

function initialSelectedCard(row: CsvImportRow, seed: CardSummary | null, finish: 'foil' | 'nonfoil'): CardSummary | null {
  if (!seed) return null
  if (recoveryJob(row) === 'price' && isPaperRecoveryCard(seed)) return seed
  return isStockableRecoveryCard(seed, finish) ? seed : null
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
      initialSelectedCard(row, seedCard, initialFilters(row).finish),
    )
    const [priceText, setPriceText] = useState(() => startingPriceText(row))
    const [priceTouched, setPriceTouched] = useState(false)
    const [searchResults, setSearchResults] = useState<CardSummary[]>([])
    const [error, setError] = useState<string | null>(null)
    const [editingSheet, setEditingSheet] = useState(false)
    const [showSearch, setShowSearch] = useState(() => job === 'match' || job === 'other')
    const [applySimilar, setApplySimilar] = useState(true)

    useEffect(() => {
      const nextJob = recoveryJob(row)
      const nextFilters = initialFilters(row)
      setName(row.name)
      setSet(row.set)
      setCollectorNumber(row.collectorNumber)
      setQuantity(startingQuantity(row))
      setCondition(
        (CONDITIONS as readonly string[]).includes(row.condition) ? (row.condition as Condition) : 'NM',
      )
      setTerm(initialTerm(row))
      setFilters(nextFilters)
      setPriceText(startingPriceText(row))
      setPriceTouched(false)
      setError(null)
      setEditingSheet(false)
      setShowSearch(nextJob === 'match' || nextJob === 'other')
      setApplySimilar(true)
      setSearchResults([])
      setSelectedCard(initialSelectedCard(row, row.card ?? null, nextFilters.finish))
    }, [row])

    const { resolveRow, saveRow, skipRow } = useRecoveryActions(slug, importId)
    const matchFromSheet = !seedCard && job !== 'match' && job !== 'other' && !showSearch
    const { data: sheetMatch, isFetching: matchingSheet } = useRecoverySearch(
      slug,
      importId,
      term,
      filters,
      matchFromSheet,
    )
    const printingsCardId = selectedCard?.id ?? seedCard?.id ?? null
    const { data: printings = [] } = useCardPrintings(slug, importId, printingsCardId)

    const isFoil = filters.finish === 'foil'
    const isSkipped = row.status === 'skipped'
    const canStockSelected = selectedCard ? isStockableRecoveryCard(selectedCard, filters.finish) : false
    const paperSelected = selectedCard ? isPaperRecoveryCard(selectedCard) : false
    const parsedPriceCents = parsePriceInput(priceText)
    const canAddWithPrice = paperSelected && (parsedPriceCents ?? 0) > 0
    const canAdd = Boolean(selectedCard) && (canStockSelected || canAddWithPrice)
    const needsSellPrice = Boolean(selectedCard) && paperSelected && !canStockSelected
    const reason = shortRowReason(row.error)
    const pricedPrintings = useMemo(
      () => printings.filter((printing) => isStockableRecoveryCard(printing, filters.finish)),
      [printings, filters.finish],
    )
    const pickList = searchResults.length > 0 ? searchResults : pricedPrintings
    const similarCount = similarRows.length
    const previewCard =
      job === 'price' && seedCard && isPaperRecoveryCard(seedCard)
        ? seedCard
        : seedCard && isStockableRecoveryCard(seedCard, filters.finish)
          ? seedCard
          : selectedCard
    const priceJobCard = selectedCard ?? seedCard
    const selectedMarketCents = selectedCard ? marketCentsFor(selectedCard, filters.finish) : null
    const siblingMarketCents = useMemo(() => {
      const sibling = pricedPrintings.find((printing) => printing.id !== selectedCard?.id)
      return sibling ? marketCentsFor(sibling, filters.finish) : null
    }, [pricedPrintings, selectedCard, filters.finish])

    const selectPrinting = useCallback(
      (card: CardSummary) => {
        setSelectedCard(card)
        if (priceTouched) return
        const cents = marketCentsFor(card, filters.finish)
        if (cents) setPriceText(dollarsFromCents(cents))
      },
      [filters.finish, priceTouched],
    )

    useEffect(() => {
      if (selectedCard || job === 'price') return
      const priced = pricedPrintings[0]
      if (priced) selectPrinting(priced)
    }, [pricedPrintings, selectedCard, job, selectPrinting])

    useEffect(() => {
      if (selectedCard || showSearch) return
      const hit = sheetMatch?.items[0]
      if (hit) selectPrinting(hit)
    }, [sheetMatch, selectedCard, showSearch, selectPrinting])

    useEffect(() => {
      if (priceTouched || (row.priceCents ?? 0) > 0) return
      if ((parsePriceInput(priceText) ?? 0) > 0) return
      const cents = selectedMarketCents ?? siblingMarketCents
      if (cents) setPriceText(dollarsFromCents(cents))
    }, [priceTouched, row.priceCents, priceText, selectedMarketCents, siblingMarketCents])

    const handleResults = useCallback((items: CardSummary[]) => {
      setSearchResults(items)
    }, [])

    function editPrice(value: string) {
      setPriceTouched(true)
      setPriceText(value)
    }

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
      if (!canAdd) {
        if (needsSellPrice) setError('Enter a sell price greater than $0.')
        return
      }
      const priceCents = (parsedPriceCents ?? 0) > 0 ? parsedPriceCents : null
      const targets = applySimilar && similarCount > 0 ? [row, ...similarRows] : [row]
      const ok = await run(async () => {
        for (const target of targets) {
          await resolveRow.mutateAsync({
            rowIndex: target.rowIndex,
            cardId: selectedCard.id,
            quantity: target.rowIndex === row.rowIndex ? quantity : startingQuantity(target),
            condition: target.rowIndex === row.rowIndex ? condition : (target.condition as Condition),
            isFoil,
            priceCents,
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
        if (job === 'online' && !canStockSelected && !canAddWithPrice) {
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
        if (card) selectPrinting(card)
      },
    }))

    const confirmLabel =
      job === 'online' && !canStockSelected && !canAddWithPrice
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (showSearch) {
                    setShowSearch(false)
                    return
                  }
                  setFilters({ ...filters, set: '', collectorNumber: '', rarity: '' })
                  setShowSearch(true)
                }}
              >
                <Search aria-hidden className="size-4" />
                {showSearch ? 'Hide printings' : 'Browse printings'}
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
                        ...(parsedPriceCents != null && parsedPriceCents > 0
                          ? { priceCents: parsedPriceCents }
                          : {}),
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
          {job === 'quantity' && !showSearch && (
            previewCard ? (
              <MatchedCardPreview card={previewCard} finish={filters.finish} />
            ) : matchingSheet ? (
              <SheetMatchStatus />
            ) : (
              <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
                Couldn&apos;t match this row from the sheet.{' '}
                <button
                  type="button"
                  className="font-medium text-fg underline-offset-2 hover:underline"
                  onClick={() => setShowSearch(true)}
                >
                  Find a printing
                </button>
                , or skip.
              </p>
            )
          )}

          {job === 'price' && !showSearch && (
            <div className="space-y-4">
              {priceJobCard ? (
                <>
                  <MatchedCardPreview card={priceJobCard} finish={filters.finish} />
                  <Input
                    label="Sell price ($)"
                    value={priceText}
                    onChange={(e) => editPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    hint={
                      selectedMarketCents
                        ? `Market price ${formatPrice(selectedMarketCents)}. Edit to override`
                        : siblingMarketCents
                          ? `From another printing (${formatPrice(siblingMarketCents)}). Edit to override`
                          : 'No market price for this printing. Set what you will sell it for'
                    }
                  />
                </>
              ) : matchingSheet ? (
                <SheetMatchStatus />
              ) : (
                <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
                  Couldn&apos;t match this row from the sheet.{' '}
                  <button
                    type="button"
                    className="font-medium text-fg underline-offset-2 hover:underline"
                    onClick={() => setShowSearch(true)}
                  >
                    Find a printing
                  </button>
                  , or skip.
                </p>
              )}
              {pricedPrintings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-fg-muted">Or pick a printing that already has a market price</p>
                  <PrintingPicker
                    printings={pricedPrintings}
                    selectedId={selectedCard?.id ?? null}
                    finish={filters.finish}
                    onSelect={selectPrinting}
                    empty="No priced printing of this card."
                  />
                </div>
              )}
            </div>
          )}

          {job === 'online' && !showSearch && (
            <div className="space-y-4">
              <p className="rounded-card border border-border bg-bg/70 px-4 py-3 text-sm text-fg">
                This looks like an Alchemy or Arena-only printing. Skip it, or pick the paper version below.
              </p>
              {matchingSheet && pricedPrintings.length === 0 ? (
                <SheetMatchStatus />
              ) : (
                <PrintingPicker
                  printings={pricedPrintings}
                  selectedId={selectedCard?.id ?? null}
                  finish={filters.finish}
                  onSelect={selectPrinting}
                  empty="No paper printing in the catalog for this name."
                />
              )}
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
              onSelect={selectPrinting}
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
                  <span className="font-semibold text-fg">
                    {selectedMarketCents
                      ? formatPrice(selectedMarketCents)
                      : parsedPriceCents
                        ? formatPrice(parsedPriceCents)
                        : 'No market price'}
                  </span>
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
              {(job === 'price' || needsSellPrice) && (
                <div className="w-32 shrink-0">
                  <Input
                    label="Sell price ($)"
                    value={priceText}
                    onChange={(e) => editPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </div>
              )}
              <QuantityStepper value={quantity} onChange={setQuantity} />
              <div className="w-52 shrink-0">
                <ConditionSegmented value={condition} onChange={setCondition} />
              </div>
              <Button
                loading={resolveRow.isPending}
                disabled={!canAdd}
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
            <p className="text-sm text-fg-muted">
              {job === 'price'
                ? 'Enter a sell price to add this printing. Enter confirms · S skips.'
                : 'Pick a stockable printing to add it. Enter confirms · S skips.'}
            </p>
          )}
        </div>
      </div>
    )
  },
)

function SheetMatchStatus() {
  return (
    <div className="flex justify-center py-16">
      <Spinner label="Matching printing from the sheet" />
    </div>
  )
}

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
        <p className="mt-3 font-display text-xl font-bold text-fg">
          {formatScryfallPrice(card, finish) === '-' ? 'No market price' : formatScryfallPrice(card, finish)}
        </p>
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

  return <PrintingGrid items={printings} selectedId={selectedId} finish={finish} onSelect={onSelect} />
}
