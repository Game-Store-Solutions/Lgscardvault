import { useMemo } from 'react'
import { Link } from 'react-router'
import { Check, ShoppingCart } from 'lucide-react'
import { cardImage } from '../../../api/client'
import type { CommanderRecommendation } from '../../../hooks'
import { CardImage, previewFromRecommendation, type CardArtPreview } from '../../../components/cards'
import { Stagger, StaggerItem } from '../../../components/motion'
import { priceLabelForCard } from '../../../lib/cardPreview'
import { MANA_COLORS } from '../../../lib/mtg'
import { cx } from '../../../lib/cx'
import type { SynergySection, SynergyViewProps } from './types'

const STACK_DEPTH = 4
const STACK_OFFSET_PX = 26

function identityAccent(colors: string[] | undefined): string {
  if (!colors?.length) return MANA_COLORS.C
  if (colors.length === 1) return MANA_COLORS[colors[0]!] ?? MANA_COLORS.C
  return `linear-gradient(135deg, ${colors.map((c) => MANA_COLORS[c] ?? MANA_COLORS.C).join(', ')})`
}

function SynergyNameBar({
  row,
  storeSlug,
  checked,
  selectable,
  disabledPick,
  signedIn,
  inCart,
  cartPending,
  onToggle,
  onPreview,
  onAdd,
}: {
  row: CommanderRecommendation
  storeSlug?: string
  checked: boolean
  selectable: boolean
  disabledPick: boolean
  signedIn?: boolean
  inCart: number
  cartPending?: boolean
  onToggle: () => void
  onPreview: () => void
  onAdd?: () => void
}) {
  const item = row.inventoryItem
  const name = item?.card.name ?? row.card.name
  const colors = item?.card.colorIdentity ?? row.card.colorIdentity
  const accent = identityAccent(colors)
  const priceLabel = priceLabelForCard(row.priceCents ?? item?.priceCents, row.inventoryOptions)
  const match = Math.round(row.score * 100)

  return (
    <div
      className={cx(
        'group/bar flex min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-bg/80 py-1 pl-1 pr-1.5 transition-colors hover:border-brand-400/50 hover:bg-surface',
        checked && 'border-brand-400/70 bg-brand-50/50 dark:bg-brand-500/10',
        !item && storeSlug && 'opacity-75',
      )}
    >
      {selectable && (
        <label className="grid size-5 shrink-0 cursor-pointer place-items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="size-3 rounded border-border text-brand-600 focus:ring-brand-500/40"
            checked={checked}
            disabled={disabledPick || (!item && Boolean(storeSlug))}
            onChange={onToggle}
            aria-label={`Select ${name}`}
          />
        </label>
      )}
      <button
        type="button"
        onClick={onPreview}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={name}
      >
        <span
          className="h-5 w-1 shrink-0 rounded-full"
          style={{ background: accent }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.68rem] font-semibold leading-tight text-fg">{name}</span>
          <span className="block truncate text-[0.58rem] font-medium text-fg-muted">
            {priceLabel ?? `${match}%`}
          </span>
        </span>
      </button>
      {storeSlug && item && (
        <div className="shrink-0 opacity-0 transition-opacity group-hover/bar:opacity-100">
          {!signedIn ? (
            <Link to="/login" className="grid size-6 place-items-center rounded-md text-fg-muted hover:text-brand-600" aria-label="Sign in to add">
              <ShoppingCart aria-hidden className="size-3.5" />
            </Link>
          ) : inCart > 0 ? (
            <Link
              to={`/s/${storeSlug}/cart`}
              className="grid size-6 place-items-center rounded-md text-success-700"
              aria-label="In cart"
            >
              <Check aria-hidden className="size-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              disabled={cartPending}
              onClick={onAdd}
              className="grid size-6 place-items-center rounded-md text-fg-muted transition-colors hover:bg-brand-500/10 hover:text-brand-600 disabled:opacity-50"
              aria-label={`Add ${name} to cart`}
            >
              <ShoppingCart aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SynergyStackColumn({
  section,
  previewCards,
  storeSlug,
  picked,
  togglePick,
  openCardPreview,
  signedIn,
  cartQtyByInventoryId,
  onAdd,
  cartPending,
}: SynergyViewProps & {
  section: SynergySection
  previewCards: CardArtPreview[]
}) {
  const stackRows = useMemo(() => section.rows.slice(-STACK_DEPTH), [section.rows])
  const listRows = useMemo(
    () => (section.rows.length > STACK_DEPTH ? section.rows.slice(0, -STACK_DEPTH) : []),
    [section.rows],
  )

  return (
    <div className="flex w-[9.5rem] shrink-0 flex-col sm:w-[10.5rem]">
      <header className="mb-2 border-b border-border/80 pb-1.5">
        <h3 className="truncate font-display text-xs font-extrabold tracking-tight text-fg">
          {section.label}
          <span className="ml-1 font-semibold text-fg-muted">({section.count})</span>
        </h3>
      </header>

      {listRows.length > 0 && (
        <ul className="mb-2 max-h-52 space-y-1 overflow-y-auto pr-0.5">
          {listRows.map((row) => {
            const item = row.inventoryItem
            const inCart = item && cartQtyByInventoryId ? (cartQtyByInventoryId.get(item.id) ?? 0) : 0
            return (
              <li key={row.card.oracleId}>
                <SynergyNameBar
                  row={row}
                  storeSlug={storeSlug}
                  checked={picked.has(row.card.oracleId)}
                  selectable
                  disabledPick={inCart > 0}
                  signedIn={signedIn}
                  inCart={inCart}
                  cartPending={cartPending}
                  onToggle={() => togglePick(row.card.oracleId, item)}
                  onPreview={() => openCardPreview(previewCards, row.card.oracleId)}
                  onAdd={item && onAdd ? () => onAdd(item) : undefined}
                />
              </li>
            )
          })}
        </ul>
      )}

      <div className="relative mt-auto min-h-[11rem] flex-1">
        {stackRows.map((row, index) => {
          const item = row.inventoryItem
          const name = item?.card.name ?? row.card.name
          const image = cardImage(item?.card ?? row.card)
          const offset = (stackRows.length - 1 - index) * STACK_OFFSET_PX
          return (
            <button
              key={row.card.oracleId}
              type="button"
              onClick={() => openCardPreview(previewCards, row.card.oracleId)}
              className="absolute left-1/2 w-[88%] -translate-x-1/2 overflow-hidden rounded-[4.5%/3.5%] bg-bg shadow-lg ring-1 ring-black/15 transition-transform hover:z-20 hover:scale-[1.03]"
              style={{ bottom: offset, zIndex: index }}
              title={name}
              aria-label={`View ${name}`}
            >
              <CardImage src={image} alt={name} className="aspect-5/7 w-full" fit="contain" showLabel={false} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SynergyVisualStacks({
  sections,
  storeSlug,
  picked,
  togglePick,
  openCardPreview,
  signedIn,
  cartQtyByInventoryId,
  onAdd,
  cartPending,
}: SynergyViewProps & { sections: SynergySection[] }) {
  const allRows = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  const previewCards = useMemo(
    () => allRows.map((row) => previewFromRecommendation(row, { storeSlug })),
    [allRows, storeSlug],
  )

  if (sections.length === 0) return null

  return (
    <Stagger immediate gap={0.04} className="flex gap-3 overflow-x-auto pb-2 pt-1">
      {sections.map((section) => (
        <StaggerItem key={section.id} className="shrink-0">
          <SynergyStackColumn
            section={section}
            storeSlug={storeSlug}
            picked={picked}
            togglePick={togglePick}
            openCardPreview={openCardPreview}
            signedIn={signedIn}
            cartQtyByInventoryId={cartQtyByInventoryId}
            onAdd={onAdd}
            cartPending={cartPending}
            previewCards={previewCards}
          />
        </StaggerItem>
      ))}
    </Stagger>
  )
}
