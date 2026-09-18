import { Pencil, Sparkles, Trash2 } from 'lucide-react'
import { cardImage, formatPrice, formatScryfallPrice } from '../../../api/client'
import type { InventoryItem } from '../../../api/types'
import { CardImage } from '../../../components/cards'
import { Badge, Button } from '../../../components/ui'
import { finishName } from '../../../lib/finishes'
import { parseInventoryNotes, variantChips } from '../../../lib/inventoryNotes'
import { FOIL_GRADIENT, rarityAccent } from '../../../lib/mtg'

export interface InventoryFloatingCardProps {
  item: InventoryItem
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}

/** Want-list-style floating art tile for Search stock — lazy art, no foil tilt. */
export function InventoryFloatingCard({ item, onEdit, onDelete, deleting }: InventoryFloatingCardProps) {
  const accent = rarityAccent(item.card.rarity)
  const notes = parseInventoryNotes(item.notes)
  const finishLabel = finishName(item.card, item.isFoil, item.finish)
  const image = cardImage(item.card)
  const variants = variantChips(notes.variant)

  return (
    <div className="group relative min-w-0 rounded-md p-1.5 -m-1.5 transition-colors hover:bg-fg/[0.06]">
      <button
        type="button"
        aria-label={`Manage ${item.card.name}`}
        onClick={onEdit}
        className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      />
      <div className="relative z-[1] pointer-events-none">
        <div className="relative overflow-hidden rounded-md bg-bg ring-1 ring-border transition-[box-shadow] group-hover:ring-fg/55">
          <CardImage
            src={image}
            alt=""
            showLabel={false}
            fit="cover"
            className="aspect-[63/88] w-full"
          />
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-bold text-fg shadow-sm ring-1 ring-border">
            {formatPrice(item.priceCents)}
          </span>
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            {item.quantity} in stock
          </span>
        </div>

        <div className="mt-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: accent }} />
          <h3 className="truncate font-display text-sm font-bold tracking-tight text-fg">{item.card.name}</h3>
        </div>
        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-fg-muted">
          {item.card.setCode?.toUpperCase() ?? '-'} · #{item.card.collectorNumber ?? '-'}
        </p>
        <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
          <Badge className="px-2 py-0 text-[11px]">{item.condition}</Badge>
          {item.isFoil ? (
            <span
              className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-white/60 px-2 py-0.5 text-[11px] font-bold text-black/80"
              style={{ backgroundImage: FOIL_GRADIENT }}
            >
              <Sparkles aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{finishLabel}</span>
            </span>
          ) : (
            <Badge tone="neutral" className="max-w-full truncate px-2 py-0 text-[11px]">
              {finishLabel}
            </Badge>
          )}
          {variants.map((chip) => (
            <Badge key={chip} tone="neutral" className="max-w-full truncate px-2 py-0 text-[11px]">
              {chip}
            </Badge>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-fg-muted">
          Market {formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')}
        </p>
        </div>
      </div>
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${item.card.name}`}
          title="Edit item"
          className="size-9 bg-surface/95 p-0 shadow-sm ring-1 ring-border hover:bg-bg"
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          loading={deleting}
          aria-label={`Remove ${item.card.name}`}
          title="Remove item"
          className="size-9 bg-surface/95 p-0 text-danger-700 shadow-sm ring-1 ring-border hover:bg-bg"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export default InventoryFloatingCard
