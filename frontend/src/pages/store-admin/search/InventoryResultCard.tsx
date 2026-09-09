import { Pencil, Sparkles, Trash2 } from 'lucide-react'
import { formatPrice, formatScryfallPrice } from '../../../api/client'
import type { InventoryItem } from '../../../api/types'
import { Badge, Button } from '../../../components/ui'
import { parseInventoryNotes } from '../../../lib/inventoryNotes'
import { FOIL_GRADIENT, rarityAccent } from '../../../lib/mtg'
import { finishName } from '../../../lib/finishes'

export interface InventoryResultCardProps {
  item: InventoryItem
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}

/** One listing row in Search stock — text-first, no card art. */
export function InventoryResultCard({ item, onEdit, onDelete, deleting }: InventoryResultCardProps) {
  const accent = rarityAccent(item.card.rarity)
  const notes = parseInventoryNotes(item.notes)
  // The badge shows THIS listing's treatment — a Reverse Holofoil line must
  // not borrow the card's first foil label ("Holofoil").
  const finishLabel = finishName(item.card, item.isFoil, item.finish)
  return (
    // The whole tile opens the manage-item modal; the action buttons stop
    // the click so delete never falls through to edit.
    <div
      role="button"
      tabIndex={0}
      aria-label={`Manage ${item.card.name}`}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      className="group flex cursor-pointer gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_16px_40px_-16px_rgb(16_24_40_/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <h3 className="truncate font-display text-base font-bold tracking-tight text-fg">{item.card.name}</h3>
            </div>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-fg-muted">
              {item.card.setCode?.toUpperCase() ?? '-'} · #{item.card.collectorNumber ?? '-'}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              aria-label={`Edit ${item.card.name}`}
              title="Edit item"
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              loading={deleting}
              aria-label={`Remove ${item.card.name}`}
              title="Remove item"
              className="text-danger-700"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{item.condition}</Badge>
          {item.isFoil ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-white/60 px-2 py-0.5 text-[0.7rem] font-bold text-black/80"
              style={{ backgroundImage: FOIL_GRADIENT }}
            >
              <Sparkles aria-hidden className="size-3" />
              {finishLabel}
            </span>
          ) : (
            <Badge tone="neutral">{finishLabel}</Badge>
          )}
          <Badge tone="brand">{item.quantity} in stock</Badge>
          {notes.variant && <Badge tone="neutral">{notes.variant}</Badge>}
          {notes.game && <Badge tone="neutral">{notes.game}</Badge>}
        </div>

        {notes.text && <p className="mt-2 line-clamp-1 text-xs text-fg-muted">{notes.text}</p>}

        <div className="mt-auto grid grid-cols-2 gap-3 pt-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Your price</p>
            <p className="mt-0.5 font-display text-lg font-bold text-fg">{formatPrice(item.priceCents)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Market</p>
            <p className="mt-0.5 font-display text-lg font-bold text-fg">
              {formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InventoryResultCard
