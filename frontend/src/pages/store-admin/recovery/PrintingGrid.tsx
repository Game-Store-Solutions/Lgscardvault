import { cardImage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { CardImage } from '../../../components/cards'
import { cx } from '../../../lib/cx'

/** Equal-width printing tiles so a long set code cannot stretch one column. */
export function PrintingGrid({
  items,
  selectedId,
  finish,
  onSelect,
}: {
  items: CardSummary[]
  selectedId: string | null
  finish: 'foil' | 'nonfoil'
  onSelect: (card: CardSummary) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
      {items.map((card, index) => {
        const selected = card.id === selectedId
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card)}
            className={cx(
              'relative min-w-0 w-full overflow-hidden rounded-card border text-left transition-colors',
              selected
                ? 'border-fg/30 bg-bg shadow-sm ring-1 ring-fg/15'
                : 'border-border bg-surface hover:border-fg/20 hover:bg-bg',
            )}
          >
            {index < 6 && (
              <span
                aria-hidden
                className="absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-btn border border-border bg-bg/90 text-[10px] font-bold text-fg-muted"
              >
                {index + 1}
              </span>
            )}
            <CardImage
              src={cardImage(card)}
              alt={card.name}
              fit="cover"
              showLabel={false}
              className="aspect-[5/7] w-full"
            />
            <span className="block px-2 py-1.5">
              <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-fg">
                {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
              </span>
              <span className="mt-0.5 block truncate text-xs font-bold text-fg">
                {formatScryfallPrice(card, finish)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
