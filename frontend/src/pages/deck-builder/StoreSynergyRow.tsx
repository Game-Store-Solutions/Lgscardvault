import { Link } from 'react-router'
import { Check, ShoppingCart } from 'lucide-react'
import { cardImage, formatPrice } from '../../api/client'
import type { CommanderRecommendation } from '../../hooks'
import { Button, buttonVariants } from '../../components/ui'
import {
  CardImage,
  cardArtButtonClassName,
} from '../../components/cards'
import { finishName } from '../../lib/finishes'
import { cx } from '../../lib/cx'
import type { DeckBuilderNavState } from '../../lib/deckBuilder'
import { ROLE_META } from './constants'

export function StoreSynergyRow({
  row,
  slug,
  signedIn,
  inCart,
  checked,
  disabledPick,
  adding,
  linkState,
  onPreview,
  onToggle,
  onAdd,
}: {
  row: CommanderRecommendation
  slug: string
  signedIn: boolean
  inCart: number
  checked: boolean
  disabledPick: boolean
  adding: boolean
  linkState?: DeckBuilderNavState
  onPreview?: () => void
  onToggle: () => void
  onAdd: () => void
}) {
  const item = row.inventoryItem
  const match = Math.round(row.score * 100)
  const roleLabel = ROLE_META[row.role]?.label ?? row.role
  const name = item?.card.name ?? row.card.name
  const typeLine = item?.card.typeLine ?? row.card.typeLine
  const image = cardImage(item?.card ?? row.card)
  const detailPath = item ? `/s/${slug}/cards/${item.id}` : null
  const visibleReasons = row.reasons

  const title = detailPath ? (
    <Link
      to={detailPath}
      state={linkState}
      className="font-display text-sm font-bold text-fg transition-colors hover:text-brand-600 sm:text-[0.95rem]"
    >
      {name}
    </Link>
  ) : (
    <span className="font-display text-sm font-bold text-fg sm:text-[0.95rem]">{name}</span>
  )

  const cardThumb = (
    <CardImage src={image} alt={name} className="aspect-5/7 w-full" />
  )

  const imageCell = onPreview ? (
    <button
      type="button"
      onClick={onPreview}
      className={cardArtButtonClassName(true)}
      aria-label={`View ${name}`}
    >
      {cardThumb}
    </button>
  ) : detailPath ? (
    <Link
      to={detailPath}
      state={linkState}
      className="w-12 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-14"
    >
      {cardThumb}
    </Link>
  ) : (
    <div className="w-12 shrink-0 overflow-hidden rounded-md shadow-sm sm:w-14">{cardThumb}</div>
  )

  return (
    <li
      className={cx(
        'group grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-3 rounded-card border bg-surface p-3 transition-colors duration-200 sm:items-center',
        checked
          ? 'border-brand-400/70 bg-brand-50/40 dark:bg-brand-500/10'
          : 'border-border hover:border-brand-400/40 hover:bg-bg/60',
        !item && 'opacity-80',
      )}
    >
      <label className="flex items-center self-center">
        <input
          type="checkbox"
          className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
          checked={checked}
          disabled={disabledPick || !item}
          onChange={onToggle}
          aria-label={`Select ${name}`}
        />
      </label>
      {imageCell}
      <div className="min-w-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
        <div className="min-w-0">
          {title}
          <p className="mt-0.5 truncate text-xs text-fg-muted">
            {typeLine}
            {item ? (
              <>
                {' · '}
                {item.condition} / {finishName(item.card, item.isFoil, item.finish)}
                {' · '}
                {item.quantity} in stock
              </>
            ) : (
              ' · not in stock here'
            )}
          </p>
          {visibleReasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {visibleReasons.slice(0, 3).map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-bg px-2 py-0.5 text-[0.65rem] font-semibold text-fg-muted"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 justify-between sm:mt-0 sm:flex-col sm:items-end sm:justify-center">
          <div className="text-right">
            <p className="font-display text-base font-extrabold tracking-tight text-fg">
              {item ? formatPrice(item.priceCents) : '—'}
            </p>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-muted">
              {roleLabel} · {match}% match
            </p>
          </div>
          {!item ? (
            <span className="rounded-full border border-border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-fg-muted">
              Not stocked
            </span>
          ) : !signedIn ? (
            <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Sign in
            </Link>
          ) : inCart > 0 ? (
            <Link to={`/s/${slug}/cart`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Check aria-hidden className="size-3.5" />
              In cart
            </Link>
          ) : (
            <Button size="sm" variant="secondary" loading={adding} onClick={onAdd}>
              <ShoppingCart aria-hidden className="size-3.5" />
              Add
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
