import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronDown, ClipboardList, GalleryHorizontalEnd, PackagePlus, Plus, Printer, RefreshCw, Search, Trash2, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, parsePriceInput } from '../../api/client'
import { storeCasesKey, useInventoryPage, usePullSheet, useStockingSheet, useStoreCases } from '../../hooks'
import { useDebouncedValue } from '../../hooks'
import type { PullSheet, StockingSheet, StoreCaseSummary, StoreSection, StoreSectionMode } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  LoadingPanel,
  Modal,
  Select,
} from '../../components/ui'

/** Rarities the auto-fill filter accepts — must mirror the backend allow-list. */
const RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'] as const

/**
 * Color-filter suggestions for the datalist. The backend parser accepts far
 * more (letter combos, aliases, "sans X", …) — these are just the common
 * names to get owners started.
 */
const COLOR_SUGGESTIONS = [
  'White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Multicolor',
  'Azorius', 'Dimir', 'Rakdos', 'Gruul', 'Selesnya', 'Orzhov', 'Izzet', 'Golgari', 'Boros', 'Simic',
  'Bant', 'Esper', 'Grixis', 'Jund', 'Naya',
  'Abzan', 'Jeskai', 'Sultai', 'Mardu', 'Temur',
  'Four-Color', 'Five-Color',
]

/**
 * Case Cards admin: manage display cases, divide each into sections, and run
 * each section as its own inventory pool — filled by hand or auto-pulled with
 * smart filters (color identity terms, set, card type, price, rarity). Every
 * section exposes a live, printable pull sheet for staff.
 */
export default function CaseCardsTab({ slug }: { slug: string }) {
  const { data: cases, isLoading } = useStoreCases(slug)
  const queryClient = useQueryClient()
  const [caseName, setCaseName] = useState('')

  const createCase = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/cases`, { name: caseName.trim() })
    },
    onSuccess: async () => {
      setCaseName('')
      await queryClient.invalidateQueries({ queryKey: storeCasesKey(slug) })
    },
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Display cases"
          subtitle="A case is a physical display in your store. Divide each one into sections. Every section tracks its own cards, quantities, and pull sheet."
        />
        <CardBody>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              if (caseName.trim()) createCase.mutate()
            }}
          >
            <Input
              label="New case name"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              placeholder="Front counter case, wall case…"
              maxLength={120}
            />
            <Button type="submit" loading={createCase.isPending} disabled={!caseName.trim()}>
              <Plus className="size-4" aria-hidden />
              Add case
            </Button>
          </form>
          {createCase.isError && (
            <p className="mt-3 text-sm font-medium text-danger-700" role="alert">
              {extractErrorMessage(createCase.error, 'Could not create the case.')}
            </p>
          )}
        </CardBody>
      </Card>

      {isLoading ? (
        <LoadingPanel />
      ) : (cases ?? []).length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No display cases yet"
          description="Create your first case above, then divide it into sections."
        />
      ) : (
        <div className="space-y-8">
          {cases!.map((storeCase) => (
            <CaseEditor key={storeCase.id} slug={slug} storeCase={storeCase} />
          ))}
        </div>
      )}
    </div>
  )
}

function CaseEditor({ slug, storeCase }: { slug: string; storeCase: StoreCaseSummary }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: storeCasesKey(slug) })
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<StoreSectionMode>('auto')

  const deleteCase = useMutation({
    mutationFn: async () => {
      await api.delete(`/stores/${slug}/cases/${storeCase.id}`)
    },
    onSuccess: invalidate,
  })

  const createSection = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/sections`, { title: title.trim(), mode, caseId: storeCase.id })
    },
    onSuccess: async () => {
      setTitle('')
      await invalidate()
    },
  })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border pb-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-fg">
          <Archive aria-hidden className="size-5 text-fg-muted" />
          {storeCase.name}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          loading={deleteCase.isPending}
          onClick={() => {
            if (window.confirm(`Delete case "${storeCase.name}" and all its sections?`)) deleteCase.mutate()
          }}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete case
        </Button>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) createSection.mutate()
        }}
      >
        <Input
          label={`Add a section to ${storeCase.name}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Black, Azorius, Rares $20+…"
          maxLength={120}
        />
        <Select label="Fill mode" value={mode} onChange={(e) => setMode(e.target.value as StoreSectionMode)}>
          <option value="auto">Auto (pull by filters)</option>
          <option value="manual">Manual (pick cards)</option>
        </Select>
        <Button type="submit" loading={createSection.isPending} disabled={!title.trim()}>
          <Plus className="size-4" aria-hidden />
          Add section
        </Button>
      </form>
      {createSection.isError && (
        <p className="text-sm font-medium text-danger-700" role="alert">
          {extractErrorMessage(createSection.error, 'Could not create the section.')}
        </p>
      )}

      {storeCase.sections.length === 0 ? (
        <p className="text-sm text-fg-muted">No sections yet. Add one above.</p>
      ) : (
        <div className="space-y-6">
          {storeCase.sections.map((section) => (
            <SectionEditor key={section.id} slug={slug} section={section} onChanged={invalidate} />
          ))}
        </div>
      )}
    </section>
  )
}

function SectionEditor({
  slug,
  section,
  onChanged,
}: {
  slug: string
  section: StoreSection
  onChanged: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pullSheetOpen, setPullSheetOpen] = useState(false)
  const [stockingSheetOpen, setStockingSheetOpen] = useState(false)
  const toStockCount = section.cards.filter((entry) => entry.needsStocking).length
  const [min, setMin] = useState(section.autoMinPriceCents != null ? (section.autoMinPriceCents / 100).toFixed(2) : '')
  const [max, setMax] = useState(section.autoMaxPriceCents != null ? (section.autoMaxPriceCents / 100).toFixed(2) : '')
  const [rarity, setRarity] = useState(section.autoRarity ?? '')
  const [color, setColor] = useState(section.autoColorIdentityLabel ?? '')
  const [setCode, setSetCode] = useState(section.autoSetCode ?? '')
  const [cardType, setCardType] = useState(section.autoCardType ?? '')
  const [cardLimit, setCardLimit] = useState(section.cardLimit != null ? String(section.cardLimit) : '')

  const parsedCardLimit = cardLimit.trim() === '' ? null : Number(cardLimit)

  const saveLimit = useMutation({
    mutationFn: async () => {
      await api.patch(`/stores/${slug}/sections/${section.id}`, { cardLimit: parsedCardLimit })
    },
    onSuccess: onChanged,
  })

  const deleteSection = useMutation({
    mutationFn: async () => {
      await api.delete(`/stores/${slug}/sections/${section.id}`)
    },
    onSuccess: onChanged,
  })

  const removeItem = useMutation({
    mutationFn: async (cardId: number) => {
      await api.delete(`/stores/${slug}/sections/${section.id}/items/${cardId}`)
    },
    onSuccess: onChanged,
  })

  const updatePool = useMutation({
    mutationFn: async ({ cardId, quantity }: { cardId: number; quantity: number }) => {
      await api.patch(`/stores/${slug}/sections/${section.id}/items/${cardId}`, { quantity })
    },
    onSuccess: onChanged,
  })

  const autoFill = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/sections/${section.id}/auto-fill`, {
        autoMinPriceCents: parsePriceInput(min),
        autoMaxPriceCents: parsePriceInput(max),
        autoRarity: rarity || null,
        autoColorIdentity: color.trim() || null,
        autoSetCode: setCode.trim() || null,
        autoCardType: cardType.trim() || null,
        cardLimit: parsedCardLimit,
      })
    },
    onSuccess: onChanged,
  })

  const colorListId = `color-suggestions-${section.id}`

  return (
    <Card>
      <CardHeader
        title={section.title}
        subtitle={
          `${section.mode === 'auto' ? 'Auto-filled' : 'Hand-picked'} · ` +
          `${section.availableQuantity} card${section.availableQuantity === 1 ? '' : 's'} available in this section`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand section ${section.title}` : `Collapse section ${section.title}`}
            >
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
              />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setStockingSheetOpen(true)}>
              <PackagePlus className="size-4" aria-hidden />
              Stocking sheet
              {toStockCount > 0 && (
                <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-warning-500 px-1 text-[0.65rem] font-bold leading-none text-white">
                  {toStockCount}
                </span>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPullSheetOpen(true)}>
              <ClipboardList className="size-4" aria-hidden />
              Pull sheet
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={deleteSection.isPending}
              onClick={() => {
                if (window.confirm(`Delete section "${section.title}"?`)) deleteSection.mutate()
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />
      {!collapsed && (
      <CardBody className="space-y-5">
        {section.mode === 'auto' ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Input
                label="Color / identity"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Black, Azorius, 5c…"
                list={colorListId}
              />
              <datalist id={colorListId}>
                {COLOR_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Select label="Rarity" value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="">Any rarity</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </Select>
              <Input label="Set code" value={setCode} onChange={(e) => setSetCode(e.target.value)} placeholder="neo, mh2…" />
              <Input label="Card type" value={cardType} onChange={(e) => setCardType(e.target.value)} placeholder="Creature, Instant…" />
              <Input label="Min price ($)" value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="0" />
              <Input label="Max price ($)" value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="Any" />
              <Input
                label="# of cards"
                value={cardLimit}
                onChange={(e) => setCardLimit(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="60 (max)"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => autoFill.mutate()} loading={autoFill.isPending}>
                <RefreshCw className="size-4" aria-hidden />
                Pull from inventory
              </Button>
              {section.autoColorIdentityLabel && (
                <span className="text-xs text-fg-muted">
                  Color filter: <span className="font-bold text-fg">{section.autoColorIdentityLabel}</span>
                </span>
              )}
              <span className="text-xs text-fg-muted">
                Pulls 1 copy per card; cards already promised to other sections are skipped. Re-pull any time. Sold cards stay tracked.
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Add cards from inventory
            </Button>
            <div className="w-32">
              <Input
                label="# of cards"
                value={cardLimit}
                onChange={(e) => setCardLimit(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  if (parsedCardLimit !== section.cardLimit) saveLimit.mutate()
                }}
                inputMode="numeric"
                placeholder="No limit"
              />
            </div>
            <span className="pb-2 text-xs text-fg-muted">
              {section.cards.length} in section{section.cardLimit != null ? ` · limit ${section.cardLimit}` : ''}
            </span>
          </div>
        )}

        {saveLimit.isError && (
          <p className="text-sm font-medium text-danger-700" role="alert">
            {extractErrorMessage(saveLimit.error, 'Could not save the card limit.')}
          </p>
        )}

        {autoFill.isError && (
          <p className="text-sm font-medium text-danger-700" role="alert">
            {extractErrorMessage(autoFill.error, 'Could not pull cards.')}
          </p>
        )}

        {section.cards.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {section.mode === 'auto'
              ? 'No cards yet. Set your filters and pull from inventory.'
              : 'No cards yet. Add some from your inventory.'}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.cards.map((entry) => {
              const card = entry.inventoryItem.card
              const soldOut = entry.remaining === 0
              return (
                <li
                  key={entry.id}
                  className={`relative flex gap-3 rounded-card border bg-surface p-2 ${soldOut ? 'border-warning-500/50 opacity-75' : 'border-border'}`}
                >
                  {card && cardImage(card) && (
                    <img src={cardImage(card)} alt={card.name} className="h-16 w-12 flex-shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">{card?.name ?? 'Unknown card'}</p>
                    <p className="text-xs text-fg-muted">
                      {card?.setCode?.toUpperCase()} · {formatPrice(entry.inventoryItem.priceCents)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1 text-fg-muted">
                        In case
                        <input
                          type="number"
                          min={entry.soldQuantity}
                          defaultValue={entry.quantity}
                          className="w-14 rounded-btn border border-border bg-surface px-1 py-0.5 text-fg"
                          onBlur={(e) => {
                            const next = Number(e.target.value)
                            if (Number.isInteger(next) && next !== entry.quantity) {
                              updatePool.mutate({ cardId: entry.id, quantity: next })
                            }
                          }}
                        />
                      </label>
                      <span className={soldOut ? 'font-bold text-warning-700' : 'text-fg-muted'}>
                        {soldOut ? 'Sold out' : `${entry.remaining} left`}
                        {entry.soldQuantity > 0 ? ` · ${entry.soldQuantity} sold` : ''}
                      </span>
                      {entry.needsStocking && <Badge tone="warning">To stock</Badge>}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove card"
                    onClick={() => removeItem.mutate(entry.id)}
                    className="absolute right-1 top-1 rounded-full p-1 text-fg-muted hover:bg-bg hover:text-danger-700"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
      )}

      {pickerOpen && (
        <InventoryPicker slug={slug} section={section} onClose={() => setPickerOpen(false)} onChanged={onChanged} />
      )}
      {pullSheetOpen && (
        <PullSheetModal slug={slug} section={section} onClose={() => setPullSheetOpen(false)} />
      )}
      {stockingSheetOpen && (
        <StockingSheetModal
          slug={slug}
          section={section}
          onClose={() => setStockingSheetOpen(false)}
          onChanged={onChanged}
        />
      )}
    </Card>
  )
}

function PullSheetModal({ slug, section, onClose }: { slug: string; section: StoreSection; onClose: () => void }) {
  const { data: sheet, isLoading } = usePullSheet(slug, section.id)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pull sheet: ${sheet?.caseName ?? ''} / ${section.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => sheet && printPullSheet(sheet)} disabled={!sheet || sheet.rows.length === 0}>
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
        </>
      }
    >
      {isLoading || !sheet ? (
        <LoadingPanel />
      ) : sheet.rows.length === 0 ? (
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="Nothing to pull"
          description="No open orders include cards from this section."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            <span className="font-bold text-fg">{sheet.totalCards}</span> card{sheet.totalCards === 1 ? '' : 's'} to pull for open
            orders. Updates as orders are placed, fulfilled, cancelled, or refunded.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3">Card</th>
                  <th className="py-2 pr-3">Set</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2">Customer</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.lineId} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-bold text-fg">{row.cardName}</td>
                    <td className="py-2 pr-3 text-fg-muted">
                      {row.setCode?.toUpperCase() ?? '—'}
                      {row.collectorNumber ? ` #${row.collectorNumber}` : ''}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-fg">{row.quantity}</td>
                    <td className="py-2 pr-3 text-fg-muted">{row.orderReference ?? '—'}</td>
                    <td className="py-2 text-fg-muted">{row.customerName ?? row.customerEmail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * Stocking sheet: the restock counterpart of the pull sheet. Lists every card
 * added or topped up by auto-fill/manual adds that staff have not yet placed
 * in the physical case, printable, with a one-click "mark all stocked" once
 * the copies are in the display.
 */
function StockingSheetModal({
  slug,
  section,
  onClose,
  onChanged,
}: {
  slug: string
  section: StoreSection
  onClose: () => void
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const { data: sheet, isLoading } = useStockingSheet(slug, section.id)

  const markStocked = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/sections/${section.id}/stocking-sheet/mark-stocked`, {})
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stocking-sheet', slug, section.id] })
      onChanged()
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stocking sheet: ${sheet?.caseName ?? ''} / ${section.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => sheet && printStockingSheet(sheet)}
            disabled={!sheet || sheet.rows.length === 0}
          >
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
          <Button
            onClick={() => markStocked.mutate()}
            loading={markStocked.isPending}
            disabled={!sheet || sheet.rows.length === 0}
          >
            <PackagePlus className="size-4" aria-hidden />
            Mark all stocked
          </Button>
        </>
      }
    >
      {isLoading || !sheet ? (
        <LoadingPanel />
      ) : sheet.rows.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="Nothing to stock"
          description="Every card in this section is already placed in the case. New auto-fill pulls and top-ups will appear here."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            <span className="font-bold text-fg">{sheet.totalCards}</span> cop{sheet.totalCards === 1 ? 'y' : 'ies'} to
            pull from stock and place in this section. Print it, place the cards, then mark them stocked.
          </p>
          {markStocked.isError && (
            <p className="text-sm font-medium text-danger-700" role="alert">
              {extractErrorMessage(markStocked.error, 'Could not mark the cards as stocked.')}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3">Card</th>
                  <th className="py-2 pr-3">Set</th>
                  <th className="py-2 pr-3">Finish / Cond.</th>
                  <th className="py-2 pr-3 text-right">Copies</th>
                  <th className="py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.sectionCardId} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-bold text-fg">{row.cardName}</td>
                    <td className="py-2 pr-3 text-fg-muted">
                      {row.setCode?.toUpperCase() ?? '—'}
                      {row.collectorNumber ? ` #${row.collectorNumber}` : ''}
                    </td>
                    <td className="py-2 pr-3 text-fg-muted">
                      {row.finish}
                      {row.condition ? ` · ${row.condition}` : ''}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-fg">{row.copies}</td>
                    <td className="py-2 text-right text-fg-muted">
                      {row.priceCents != null ? formatPrice(row.priceCents) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Print the stocking sheet through a transient iframe (same pattern as the pull sheet). */
function printStockingSheet(sheet: StockingSheet) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', `Print stocking sheet ${sheet.sectionTitle}`)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    return
  }
  frameWindow.addEventListener('afterprint', () => iframe.remove(), { once: true })

  const rows = sheet.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.cardName)}</td>
          <td>${escapeHtml(row.setCode?.toUpperCase() ?? '-')}${row.collectorNumber ? ' #' + escapeHtml(row.collectorNumber) : ''}</td>
          <td>${escapeHtml(row.finish)}${row.condition ? ' · ' + escapeHtml(row.condition) : ''}</td>
          <td>${row.copies}</td>
          <td>[&nbsp;&nbsp;]</td>
        </tr>`,
    )
    .join('')

  frameDocument.open()
  frameDocument.write(`
    <!doctype html>
    <html>
      <head>
        <title>Stocking sheet: ${escapeHtml(sheet.caseName ?? '')} / ${escapeHtml(sheet.sectionTitle)}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          header { border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .muted { color: #4b5563; font-size: 13px; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; }
          th { color: #4b5563; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
          td:nth-child(4), th:nth-child(4) { text-align: right; }
          @media print { body { margin: 14mm; } }
        </style>
      </head>
      <body>
        <header>
          <h1>Stocking Sheet: ${escapeHtml(sheet.caseName ?? 'Case')} / ${escapeHtml(sheet.sectionTitle)}</h1>
          <div class="muted">${sheet.totalCards} cop${sheet.totalCards === 1 ? 'y' : 'ies'} to place in the case · generated ${escapeHtml(new Date(sheet.generatedAt).toLocaleString())}</div>
        </header>
        <table>
          <thead>
            <tr><th>Card</th><th>Set</th><th>Finish / Cond.</th><th>Copies</th><th>Placed</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `)
  frameDocument.close()

  window.setTimeout(() => {
    frameWindow.focus()
    frameWindow.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}

/** Print the pull sheet through a transient iframe (same pattern as the order sheet). */
function printPullSheet(sheet: PullSheet) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', `Print pull sheet ${sheet.sectionTitle}`)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    return
  }
  frameWindow.addEventListener('afterprint', () => iframe.remove(), { once: true })

  const rows = sheet.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.cardName)}</td>
          <td>${escapeHtml(row.setCode?.toUpperCase() ?? '-')}${row.collectorNumber ? ' #' + escapeHtml(row.collectorNumber) : ''}</td>
          <td>${row.quantity}</td>
          <td>${escapeHtml(row.orderReference ?? '-')}</td>
          <td>${escapeHtml(row.customerName ?? row.customerEmail ?? '-')}</td>
        </tr>`,
    )
    .join('')

  frameDocument.open()
  frameDocument.write(`
    <!doctype html>
    <html>
      <head>
        <title>Pull sheet: ${escapeHtml(sheet.caseName ?? '')} / ${escapeHtml(sheet.sectionTitle)}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          header { border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .muted { color: #4b5563; font-size: 13px; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; }
          th { color: #4b5563; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
          td:nth-child(3), th:nth-child(3) { text-align: right; }
          @media print { body { margin: 14mm; } }
        </style>
      </head>
      <body>
        <header>
          <h1>Pull Sheet: ${escapeHtml(sheet.caseName ?? 'Case')} / ${escapeHtml(sheet.sectionTitle)}</h1>
          <div class="muted">${sheet.totalCards} card${sheet.totalCards === 1 ? '' : 's'} to pull · generated ${escapeHtml(new Date(sheet.generatedAt).toLocaleString())}</div>
        </header>
        <table>
          <thead>
            <tr><th>Card</th><th>Set</th><th>Qty</th><th>Order</th><th>Customer</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `)
  frameDocument.close()

  window.setTimeout(() => {
    frameWindow.focus()
    frameWindow.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function InventoryPicker({
  slug,
  section,
  onClose,
  onChanged,
}: {
  slug: string
  section: StoreSection
  onClose: () => void
  onChanged: () => void
}) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 200)

  const alreadyIn = useMemo(
    () => new Set(section.cards.map((c) => c.inventoryItem.id)),
    [section.cards],
  )

  // Search server-side rather than filtering a full inventory download in the
  // browser; with no term this is just the first page of the store's listings.
  const { data: searchPage, isFetching: isLoading } = useInventoryPage(slug, {
    q: debounced.trim(),
    itemsPerPage: 60,
  })
  const results = searchPage?.items ?? []

  const addMutation = useMutation({
    mutationFn: async (inventoryItemId: number) => {
      await api.post(`/stores/${slug}/sections/${section.id}/items`, { inventoryItemId })
    },
    onSuccess: onChanged,
  })

  return (
    <Modal open onClose={onClose} title={`Add cards to “${section.title}”`}>
      <div className="space-y-4">
        <Input
          label="Search inventory"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Card name…"
          autoFocus
        />
        {isLoading ? (
          <LoadingPanel />
        ) : results.length === 0 ? (
          <EmptyState icon={Search} title="No matching listings" description="Try a different search." />
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {results.map((item) => {
              const added = alreadyIn.has(item.id)
              return (
                <li key={item.id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-2">
                  {cardImage(item.card) && (
                    <img src={cardImage(item.card)} alt={item.card.name} className="h-14 w-10 flex-shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">{item.card.name}</p>
                    <p className="text-xs text-fg-muted">
                      {item.card.setCode?.toUpperCase()} · {formatPrice(item.priceCents)}
                      {item.isFoil ? ` · ${item.finish}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'ghost' : 'primary'}
                    disabled={added}
                    loading={addMutation.isPending && addMutation.variables === item.id}
                    onClick={() => addMutation.mutate(item.id)}
                  >
                    {added ? 'Added' : 'Add'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
