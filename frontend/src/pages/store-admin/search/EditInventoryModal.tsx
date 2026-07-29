import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Search, TrendingUp } from 'lucide-react'
import api, { cardImage, formatPrice, formatScryfallPrice, parsePriceInput, scryfallPriceCents } from '../../../api/client'
import type { CardSummary, InventoryItem } from '../../../api/types'
import { Badge, Button, Input, Modal } from '../../../components/ui'
import { InteractiveCard } from '../../../components/cards'
import { CONDITION_LABELS, ConditionSegmented, FinishPicker, QuantityStepper, type Condition } from '../../../components/inventory'
import { rarityAccent } from '../../../lib/mtg'
import { defaultFinishFor, finishChoices, finishOptions, isFoilFinish } from '../../../lib/finishes'

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
  slug,
  item,
  inventory,
  pending,
  onClose,
  onSave,
}: Omit<EditInventoryModalProps, 'item'> & { item: InventoryItem }) {
  const [editSelectedCard, setEditSelectedCard] = useState<CardSummary>(item.card)
  const [editQuantity, setEditQuantity] = useState(item.quantity)
  const [editPriceText, setEditPriceText] = useState(formatPrice(item.priceCents))
  const [editCostText, setEditCostText] = useState(
    item.acquisitionCostCents != null ? formatPrice(item.acquisitionCostCents) : '',
  )
  const [editCondition, setEditCondition] = useState<Condition>(item.condition)
  const [editFinish, setEditFinish] = useState(item.finish || defaultFinishFor(item.card))
  const [variantSearchActive, setVariantSearchActive] = useState(false)

  // The printing's own treatments, so a Pokemon listing can be moved between
  // Holofoil and Reverse Holofoil instead of one shared "foil".
  const finishes = finishOptions(editSelectedCard)
  const editIsFoil = isFoilFinish(editFinish)
  const marketCents = scryfallPriceCents(editSelectedCard, editIsFoil ? 'foil' : 'nonfoil')
  const priceCents = parsePriceInput(editPriceText)
  const priceInvalid = priceCents === null

  // Warn when the chosen printing + condition + finish already exists on another
  // listing — saving will MERGE (sum quantities) rather than create a duplicate.
  const mergeTarget = inventory.find(
    (it) =>
      it.id !== item.id &&
      it.card.id === editSelectedCard.id &&
      it.condition === editCondition &&
      it.finish === editFinish,
  )

  const { data: variantResults = [], isFetching: variantsLoading } = useQuery({
    queryKey: ['card-variants', slug, item.card.id, item.card.name],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        // Other printings of this card mean other printings in ITS game —
        // an unscoped search would answer with Magic for every game.
        params: { q: item.card.name, game: item.card.gameCode ?? 'mtg' },
      })
      return data.filter((card) => card.id !== item.card.id).slice(0, 12)
    },
    enabled: variantSearchActive,
  })

  function selectVariant(card: CardSummary) {
    setEditSelectedCard(card)
    // Keep the treatment when the new printing also sells it; otherwise fall
    // back to whatever that printing leads with.
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
      className="max-w-[calc(100vw-2rem)] 2xl:max-w-[92rem]"
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
      <div>
        <div className="grid gap-8 xl:grid-cols-[24rem_minmax(0,1fr)]">
          {/* Left: interactive holographic card + facts */}
          <div className="space-y-4">
            <InteractiveCard
              image={cardImage(editSelectedCard)}
              alt={editSelectedCard.name}
              foil={editIsFoil}
              accent={rarityAccent(editSelectedCard.rarity)}
              maxTilt={12}
            />
            <div>
              <p className="font-display font-bold leading-snug text-fg">{editSelectedCard.name}</p>
              <p className="text-xs uppercase tracking-wide text-fg-muted">
                {editSelectedCard.setCode?.toUpperCase() ?? '-'} · #{editSelectedCard.collectorNumber ?? '-'}
              </p>
            </div>
            <dl className="space-y-2 border-t border-border pt-3 text-sm">
              <Row label="Stored price" value={formatPrice(item.priceCents)} />
              <Row label="Market price" value={marketCents !== null ? formatPrice(marketCents) : 'Unavailable'} />
              <Row label="In stock" value={String(item.quantity)} />
            </dl>
          </div>

          {/* Right: interactive editable fields */}
          <div className="space-y-5">
            <div>
              <p className="mb-1.5 text-sm font-bold text-fg">Quantity</p>
              <QuantityStepper value={editQuantity} onChange={setEditQuantity} />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-bold text-fg">Condition</p>
              <ConditionSegmented value={editCondition} onChange={setEditCondition} />
              <p className="mt-1 text-xs text-fg-muted">{CONDITION_LABELS[editCondition]}</p>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-bold text-fg">Finish</p>
              <FinishPicker value={editFinish} options={finishes} onChange={setEditFinish} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-bold text-fg">Price</p>
                <button
                  type="button"
                  onClick={useMarketPrice}
                  disabled={marketCents === null}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-fg-muted disabled:no-underline"
                >
                  <TrendingUp aria-hidden className="size-3.5" />
                  Use market {marketCents !== null ? `(${formatPrice(marketCents)})` : '(n/a)'}
                </button>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editPriceText}
                  onChange={(e) => setEditPriceText(e.target.value)}
                  aria-invalid={priceInvalid || undefined}
                  className="pl-7"
                />
              </div>
              {priceInvalid && <p className="mt-1 text-xs font-medium text-danger-700">Enter a valid price.</p>}
            </div>

            <div>
              <Input
                label="Your cost per copy ($, optional)"
                value={editCostText}
                onChange={(e) => setEditCostText(e.target.value)}
                inputMode="decimal"
                placeholder="What you paid — powers profit reports"
              />
            </div>

            {mergeTarget && (
              <div className="flex gap-2 rounded-card border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 flex-shrink-0" />
                <p>
                  A listing for this printing ({editCondition}, {editFinish}) already exists with{' '}
                  <span className="font-bold">{mergeTarget.quantity}</span> in stock. Saving will <span className="font-bold">merge</span>{' '}
                  them into one listing of <span className="font-bold">{mergeTarget.quantity + editQuantity}</span>.
                </p>
              </div>
            )}

            {/* Variants — placed beside the card so it fills the column instead
                of leaving a bare gap under the price field. */}
            <div className="border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-fg">Variants</h3>
                  <p className="text-xs text-fg-muted">
                    {variantSearchActive ? 'Other printings matching this name.' : 'Find other printings of this card.'}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setVariantSearchActive(true)} loading={variantsLoading}>
                  <Search className="size-4" aria-hidden />
                  Find variants
                </Button>
              </div>

              {variantSearchActive && (
                <div className="mt-4">
                  {variantResults.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      {variantResults.map((card) => {
                        const selectedVariant = editSelectedCard.id === card.id
                        const variantChoices = finishChoices(card)
                        const previewFinish =
                          variantChoices.hasFoil && !variantChoices.hasPlain ? 'foil' : 'nonfoil'
                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => selectVariant(card)}
                            className={`flex min-h-40 items-start gap-4 rounded-card border p-4 text-left transition-colors ${
                              selectedVariant
                                ? 'border-brand-500 bg-brand-50'
                                : 'border-border bg-surface hover:border-brand-300'
                            }`}
                          >
                            <div className="h-32 w-[5.75rem] flex-shrink-0 overflow-hidden rounded-btn border border-border bg-bg">
                              {cardImage(card) ? (
                                <img src={cardImage(card)} alt={card.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="grid h-full place-items-center text-[0.7rem] text-fg-muted">No image</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-display text-base font-bold leading-snug text-fg [overflow-wrap:anywhere]">{card.name}</p>
                              <p className="mt-0.5 text-xs uppercase text-fg-muted">
                                {card.setCode?.toUpperCase() ?? '-'} · #{card.collectorNumber ?? '-'}
                              </p>
                              <p className="mt-1 text-sm font-bold text-brand-600">{formatScryfallPrice(card, previewFinish)}</p>
                              {card.setName && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{card.setName}</p>}
                              {card.rarity && <Badge className="mt-2 capitalize">{card.rarity}</Badge>}
                              {selectedVariant && (
                                <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-wide text-brand-600">
                                  Selected
                                </p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    !variantsLoading && <p className="text-sm text-fg-muted">No additional variants found.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
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
