import { useMemo } from 'react'
import { CardStackLayers } from '../CardStackLayers'
import type { AssembledDeckCard } from '../../../hooks'
import { previewFromDeckRow, type CardArtPreview } from '../../../components/cards'
import { Stagger, StaggerItem } from '../../../components/motion'
import { priceLabelForCard } from '../../../lib/cardPreview'
import { MANA_COLORS } from '../../../lib/mtg'
import { cx } from '../../../lib/cx'
import type { SynergySection } from '../synergy/types'

const STACK_DEPTH = 4
function identityAccent(colors: string[] | undefined): string {
  if (!colors?.length) return MANA_COLORS.C
  if (colors.length === 1) return MANA_COLORS[colors[0]!] ?? MANA_COLORS.C
  return `linear-gradient(135deg, ${colors.map((c) => MANA_COLORS[c] ?? MANA_COLORS.C).join(', ')})`
}

function DeckNameBar({
  row,
  storeSlug,
  onPreview,
}: {
  row: AssembledDeckCard
  storeSlug?: string
  onPreview: () => void
}) {
  const item = row.inventoryItem
  const name = item?.card.name ?? row.card.name
  const colors = item?.card.colorIdentity ?? row.card.colorIdentity
  const priceLabel = priceLabelForCard(row.priceCents ?? item?.priceCents, row.inventoryOptions)

  return (
    <button
      type="button"
      onClick={onPreview}
      className={cx(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-bg/80 py-1 pl-1 pr-1.5 text-left transition-colors hover:border-brand-400/50 hover:bg-surface',
        !item && storeSlug && 'opacity-75',
      )}
      title={name}
    >
      <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: identityAccent(colors) }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.68rem] font-semibold leading-tight text-fg">{name}</span>
        <span className="block truncate text-[0.58rem] font-medium text-fg-muted">
          {row.quantity > 1 ? `${row.quantity}× · ` : ''}
          {priceLabel ?? row.slot.replaceAll('_', ' ')}
        </span>
      </span>
    </button>
  )
}

function DeckStackColumn({
  section,
  previewCards,
  storeSlug,
  onOpenCardPreview,
}: {
  section: SynergySection<AssembledDeckCard>
  previewCards: CardArtPreview[]
  storeSlug?: string
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const rows = section.rows
  const stackRows = useMemo(() => rows.slice(-STACK_DEPTH), [rows])
  const listRows = useMemo(
    () => (rows.length > STACK_DEPTH ? rows.slice(0, -STACK_DEPTH) : []),
    [rows],
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
          {listRows.map((row) => (
            <li key={row.card.oracleId}>
              <DeckNameBar
                row={row}
                storeSlug={storeSlug}
                onPreview={() => onOpenCardPreview(previewCards, row.card.oracleId)}
              />
            </li>
          ))}
        </ul>
      )}

      <CardStackLayers
        rows={stackRows}
        onOpen={(row) => onOpenCardPreview(previewCards, row.card.oracleId)}
      />
    </div>
  )
}

export function DeckVisualStacks({
  sections,
  storeSlug,
  onOpenCardPreview,
}: {
  sections: SynergySection<AssembledDeckCard>[]
  storeSlug?: string
  onOpenCardPreview: (cards: CardArtPreview[], oracleId: string) => void
}) {
  const allRows = useMemo(
    () => sections.flatMap((section) => section.rows as AssembledDeckCard[]),
    [sections],
  )
  const previewCards = useMemo(
    () => allRows.map((row) => previewFromDeckRow(row, { storeSlug })),
    [allRows, storeSlug],
  )

  if (sections.length === 0) return null

  return (
    <Stagger immediate gap={0.04} className="flex gap-3 overflow-x-auto pb-2 pt-1">
      {sections.map((section) => (
        <StaggerItem key={section.id} className="shrink-0">
          <DeckStackColumn
            section={section}
            previewCards={previewCards}
            storeSlug={storeSlug}
            onOpenCardPreview={onOpenCardPreview}
          />
        </StaggerItem>
      ))}
    </Stagger>
  )
}
