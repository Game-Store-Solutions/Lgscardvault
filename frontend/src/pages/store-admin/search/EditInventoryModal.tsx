import { useMemo, useState } from 'react'
import { AlertTriangle, Search, TrendingUp } from 'lucide-react'
import { cardImage, formatPrice, parsePriceInput, scryfallPriceCents } from '../../../api/client'
import type { CardSummary, InventoryItem } from '../../../api/types'
import { Button, Field, Input, Modal, Skeleton } from '../../../components/ui'
import { InteractiveCard } from '../../../components/cards'
import { Stagger, StaggerItem } from '../../../components/motion'
import { CONDITION_LABELS, ConditionSegmented, FinishPicker, QuantityStepper, type Condition } from '../../../components/inventory'
import { rarityAccent } from '../../../lib/mtg'
import { defaultFinishFor, finishOptions, isFoilFinish } from '../../../lib/finishes'
import { useCardPrintings } from '../../../hooks'
import { PrintingGrid } from '../recovery/PrintingGrid'

/** Payload emitted when saving an inventory edit (shared with the update mutation). */
export interface InventoryEditPayload {
  itemId: number
  cardId: string
  quantity: number
  priceText: string
  costText: string
  condition: Condition
  finish: string
}

export interface EditInventoryModalProps {
  slug: string
  item: InventoryItem | null
  inventory: InventoryItem[]
  pending: boolean
  onClose: () => void
  onSave: (payload: InventoryEditPayload) => void
}

/** Edit modal wrapper — renders nothing until an item is selected, so the body
 * can safely seed its state from a non-null item on each open. */
export function EditInventoryModal({ item, ...rest }: EditInventoryModalProps) {
  if (!item) return null
  return <EditInventoryModalBody item={item} {...rest} />
}

function EditInventoryModalBody({
  item,
  inventory,
  pending,
  onClose,
  onSave,
}: Omit<EditInventoryModalProps, 'item' | 'slug'> & { item: InventoryItem }) {
  const [editSelectedCard, setEditSelectedCard] = useState<CardSummary>(item.card)
  const [editQuantity, setEditQuantity] = useState(item.quantity)
  const [editPriceText, setEditPriceText] = useState(formatPrice(item.priceCents))
  const [editCostText, setEditCostText] = useState(
    item.acquisitionCostCents != null ? formatPrice(item.acquisitionCostCents) : '',
  )
  const [editCondition, setEditCondition] = useState<Condition>(item.condition)
  const [editFinish, setEditFinish] = useState(item.finish || defaultFinishFor(item.card))
  const [variantQuery, setVariantQuery] = useState('')

  const printingsQuery = useCardPrintings(item.card.id)
  const printings = printingsQuery.data ?? []
  const otherPrintings = printings.filter((card) => card.id !== item.card.id)

  const visiblePrintings = useMemo(() => {
    const needle = variantQuery.trim().toLowerCase()
    if (!needle) return printings
    return printings.filter((card) =>
      [card.setCode, card.setName, card.collectorNumber, card.lang, card.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [printings, variantQuery])

  const finishes = finishOptions(editSelectedCard)
  const editIsFoil = isFoilFinish(editFinish)
  const marketCents = scryfallPriceCents(editSelectedCard, editIsFoil ? 'foil' : 'nonfoil')
  const priceCents = parsePriceInput(editPriceText)
  const priceInvalid = priceCents === null || priceCents <= 0

  const mergeTarget = inventory.find(
    (listing) =>
      listing.id !== item.id &&
      listing.card.id === editSelectedCard.id &&
      listing.condition === editCondition &&
      listing.finish === editFinish,
  )

  function selectVariant(card: CardSummary) {
    setEditSelectedCard(card)
    const available = finishOptions(card)
    const nextFinish = available.some((option) => option.value === editFinish)
      ? editFinish
      : defaultFinishFor(card)
    setEditFinish(nextFinish)
    setEditPriceText(formatPrice(scryfallPriceCents(card, isFoilFinish(nextFinish) ? 'foil' : 'nonfoil') ?? 0))
  }

  function useMarketPrice() {
    if (marketCents !== null) setEditPriceText(formatPrice(marketCents))
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${item.card.name}`}
      className="max-w-[calc(100vw-2rem)] xl:max-w-6xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={priceInvalid}
            onClick={() =>
              onSave({
                itemId: item.id,
                cardId: editSelectedCard.id,
                quantity: editQuantity,
                priceText: editPriceText,
                costText: editCostText,
                condition: editCondition,
                finish: editFinish,
              })
            }
          >
            {mergeTarget ? 'Save & merge' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <div className="rounded-3xl bg-bg/70 p-4 ring-1 ring-black/[0.04] dark:ring-white/10 sm:p-5">
            <InteractiveCard
              image={cardImage(editSelectedCard)}
              alt={editSelectedCard.name}
              foil={editIsFoil}
              accent={rarityAccent(editSelectedCard.rarity)}
              maxTilt={12}
            />
            <div className="mt-4 space-y-1">
              <p className="font-display text-lg font-bold leading-snug tracking-tight text-fg">
                {editSelectedCard.name}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">
                {editSelectedCard.setCode?.toUpperCase() ?? '—'} · #{editSelectedCard.collectorNumber ?? '—'}
                {editSelectedCard.lang && editSelectedCard.lang !== 'en'
                  ? ` · ${editSelectedCard.lang.toUpperCase()}`
                  : ''}
              </p>
            </div>
            <dl className="mt-4 space-y-2.5 border-t border-border/70 pt-4 text-sm">
              <Row label="Stored price" value={formatPrice(item.priceCents)} />
              <Row label="Market price" value={marketCents !== null ? formatPrice(marketCents) : 'Unavailable'} />
              <Row label="In stock" value={String(item.quantity)} />
            </dl>
          </div>

          <Stagger immediate gap={0.05} className="space-y-5 rounded-3xl bg-bg/70 p-4 ring-1 ring-black/[0.04] dark:ring-white/10 sm:p-6">
            <StaggerItem>
              <Field label="Quantity">
                <QuantityStepper value={editQuantity} onChange={setEditQuantity} />
              </Field>
            </StaggerItem>
            <StaggerItem>
              <Field label="Condition" hint={CONDITION_LABELS[editCondition]}>
                <ConditionSegmented value={editCondition} onChange={setEditCondition} />
              </Field>
            </StaggerItem>
            <StaggerItem>
              <Field label="Finish">
                <FinishPicker value={editFinish} options={finishes} onChange={setEditFinish} />
              </Field>
            </StaggerItem>
            <StaggerItem>
              <Field
                label="Price"
                error={priceInvalid ? 'Enter a sell price above $0.00.' : undefined}
                hint={
                  <button
                    type="button"
                    onClick={useMarketPrice}
                    disabled={marketCents === null}
                    className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline disabled:cursor-not-allowed disabled:font-normal disabled:text-fg-muted disabled:no-underline"
                  >
                    <TrendingUp aria-hidden className="size-3.5" />
                    Use market {marketCents !== null ? `(${formatPrice(marketCents)})` : '(n/a)'}
                  </button>
                }
              >
                {({ id, describedBy }) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">$</span>
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      type="text"
                      inputMode="decimal"
                      value={editPriceText}
                      onChange={(event) => setEditPriceText(event.target.value)}
                      aria-invalid={priceInvalid || undefined}
                      className="pl-7"
                    />
                  </div>
                )}
              </Field>
            </StaggerItem>
            <StaggerItem>
              <Input
                label="Your cost per copy ($, optional)"
                value={editCostText}
                onChange={(event) => setEditCostText(event.target.value)}
                inputMode="decimal"
                placeholder="What you paid. Powers profit reports"
              />
            </StaggerItem>
            {mergeTarget && (
              <StaggerItem>
                <div className="flex gap-2 rounded-2xl border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 flex-shrink-0" />
                  <p>
                    A listing for this printing ({editCondition}, {editFinish}) already exists with{' '}
                    <span className="font-bold">{mergeTarget.quantity}</span> in stock. Saving will{' '}
                    <span className="font-bold">merge</span> them into one listing of{' '}
                    <span className="font-bold">{mergeTarget.quantity + editQuantity}</span>.
                  </p>
                </div>
              </StaggerItem>
            )}
          </Stagger>
        </div>

        <section className="rounded-3xl bg-bg/70 p-4 ring-1 ring-black/[0.04] dark:ring-white/10 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold tracking-tight text-fg">Printings</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                {printingsQuery.isFetching && printings.length === 0
                  ? 'Loading every paper printing of this card…'
                  : otherPrintings.length > 0
                    ? `${otherPrintings.length} other ${otherPrintings.length === 1 ? 'printing' : 'printings'} of ${item.card.name}. Click one to switch this listing.`
                    : 'This is the only paper printing we have for this card.'}
              </p>
            </div>
            {printings.length > 6 && (
              <div className="relative w-full sm:w-64">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                <Input
                  value={variantQuery}
                  onChange={(event) => setVariantQuery(event.target.value)}
                  placeholder="Filter set, #, or language…"
                  className="pl-9"
                  aria-label="Filter printings"
                />
              </div>
            )}
          </div>

          <div className="mt-4">
            {printingsQuery.isFetching && printings.length === 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3" aria-busy="true" aria-label="Loading printings">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="overflow-hidden rounded-2xl ring-1 ring-border">
                    <Skeleton className="aspect-[5/7] w-full rounded-none" />
                    <div className="space-y-1.5 p-2">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : printingsQuery.isError ? (
              <p role="alert" className="text-sm font-medium text-danger-700">
                Could not load printings.{' '}
                <button type="button" className="font-bold underline" onClick={() => void printingsQuery.refetch()}>
                  Try again
                </button>
              </p>
            ) : visiblePrintings.length === 0 ? (
              <p className="text-sm text-fg-muted">No printings match that filter.</p>
            ) : (
              <PrintingGrid
                items={visiblePrintings}
                selectedId={editSelectedCard.id}
                finish={editIsFoil ? 'foil' : 'nonfoil'}
                onSelect={selectVariant}
                showIndex={false}
              />
            )}
          </div>
        </section>
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-fg-muted">{label}</span>
      <span className="font-bold text-fg">{value}</span>
    </div>
  )
}

export default EditInventoryModal
