import { cardImage, formatScryfallPrice } from '../../api/client'
import type { CardSummary } from '../../api/types'
import { CardImage } from '../cards'
import { Stagger, StaggerItem } from '../motion'
import { cx } from '../../lib/cx'

/** Equal-width printing tiles so a long set code cannot stretch one column. */
export function PrintingGrid({
  items,
  selectedId,
  finish,
  onSelect,
  showIndex = true,
  size = 'md',
}: {
  items: CardSummary[]
  selectedId: string | null
  finish: 'foil' | 'nonfoil'
  onSelect: (card: CardSummary) => void
  showIndex?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const compact = size === 'sm'
  // lg: fewer columns so art stays readable in sell/trade pickers.
  const gridClass =
    size === 'lg'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
      : compact
        ? 'grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2'
        : 'grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3'

  // Staggering dozens of printings (Sol Ring, etc.) is slow — paint them at once.
  const animate = items.length <= 24

  const tiles = items.map((card, index) => {
    const selected = card.id === selectedId
    const lang = card.lang?.toLowerCase()
    const tile = (
      <button
        type="button"
        onClick={() => onSelect(card)}
        className={cx(
          'relative min-w-0 w-full overflow-hidden border text-left transition-[border-color,box-shadow,transform] duration-200',
          compact ? 'rounded-xl' : 'rounded-2xl',
          selected
            ? 'border-brand-400 bg-bg shadow-md ring-2 ring-brand-500/25'
            : 'border-border/80 bg-surface hover:border-fg/20 hover:bg-bg hover:shadow-sm',
        )}
      >
        {showIndex && index < 6 && (
          <span
            aria-hidden
            className="absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-btn border border-border bg-bg/90 text-[10px] font-bold text-fg-muted"
          >
            {index + 1}
          </span>
        )}
        {lang && lang !== 'en' && (
          <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-bg/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg shadow-sm ring-1 ring-border">
            {lang}
          </span>
        )}
        <CardImage
          src={cardImage(card)}
          alt={card.name}
          fit="cover"
          showLabel={false}
          className="aspect-[5/7] h-auto w-full max-w-full min-w-0"
        />
        <span className={cx('block', compact ? 'px-1.5 py-1' : 'px-2 py-1.5')}>
          <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-fg">
            {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
          </span>
          {size !== 'sm' && card.setName ? (
            <span className="mt-0.5 block truncate text-[10px] text-fg-muted">{card.setName}</span>
          ) : null}
          <span className="mt-0.5 block truncate text-xs font-bold text-fg">{formatScryfallPrice(card, finish)}</span>
        </span>
      </button>
    )

    if (!animate) {
      return (
        <div key={card.id} className="min-w-0 w-full overflow-hidden">
          {tile}
        </div>
      )
    }

    return (
      <StaggerItem key={card.id} y={10} className="min-w-0 w-full overflow-hidden">
        {tile}
      </StaggerItem>
    )
  })

  if (!animate) {
    return <div className={gridClass}>{tiles}</div>
  }

  return (
    <Stagger immediate gap={0.035} className={gridClass}>
      {tiles}
    </Stagger>
  )
}
