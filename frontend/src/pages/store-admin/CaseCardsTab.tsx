import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronDown, ClipboardList, GalleryHorizontalEnd, GripVertical, Minus, PackagePlus, Plus, Printer, RefreshCw, Search, Trash2, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage, formatPrice, parsePriceInput } from '../../api/client'
import { storeCasesKey, useInventoryPage, usePullSheet, useStockingSheet, useStoreCases, useStoreGames } from '../../hooks'
import { useDebouncedValue } from '../../hooks'
import type { CardSummary, PullSheet, StockingSheet, StoreCaseSummary, StoreSection, StoreSectionMode } from '../../api/types'
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
  dropdownItemClass,
  dropdownPanelClass,
} from '../../components/ui'
import { AnimatePresence, EASE_PREMIUM, motion, Reorder, useDragControls } from '../../components/motion'
import { catalogNamesMatch, foldSearchText, typeaheadNameTier } from '../../lib/searchText'
import { cx } from '../../lib/cx'

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
] as const

/** Map API label/code back to a Select option value the parser accepts. */
function colorFilterSelectValue(section: StoreSection): string {
  const label = section.autoColorIdentityLabel?.trim() ?? ''
  if (label) {
    const name = label.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const match = COLOR_SUGGESTIONS.find((s) => s.toLowerCase() === name.toLowerCase())
    if (match) return match
  }
  const code = section.autoColorIdentity?.trim() ?? ''
  if (!code) return ''
  // Exact letter codes that aren't in the friendly list (e.g. custom WUB)
  return code
}

/** Unsold case copies of a listing claimed by every section except one. */
function caseCopiesClaimedElsewhere(
  cases: StoreCaseSummary[],
  inventoryItemId: number,
  excludeSectionId: number,
): number {
  let claimed = 0
  for (const storeCase of cases) {
    for (const section of storeCase.sections) {
      if (section.id === excludeSectionId) continue
      for (const entry of section.cards) {
        if (entry.inventoryItem.id === inventoryItemId) {
          claimed += entry.remaining
        }
      }
    }
  }
  return claimed
}

/** How many on-hand copies can still be put in this section's pool. */
function freeCaseCopies(
  cases: StoreCaseSummary[],
  inventoryItemId: number,
  onHand: number,
  excludeSectionId: number,
): number {
  return Math.max(0, onHand - caseCopiesClaimedElsewhere(cases, inventoryItemId, excludeSectionId))
}

/**
 * "In case" stepper — digit slides with the click; parent keeps quantity
 * optimistic so it never snaps 2→1→2 while the PATCH refetches.
 */
function CasePoolQuantityInput({
  quantity,
  min,
  max,
  pending,
  onCommit,
}: {
  quantity: number
  min: number
  max: number
  pending?: boolean
  onCommit: (quantity: number) => void
}) {
  const [direction, setDirection] = useState<1 | -1>(1)
  const atMin = quantity <= min
  const atMax = quantity >= max
  const locked = max < min

  function step(delta: 1 | -1) {
    const next = Math.min(max, Math.max(min, quantity + delta))
    if (next === quantity || locked) return
    setDirection(delta)
    onCommit(next)
  }

  return (
    <div className="flex items-center gap-1.5 text-fg-muted">
      <span className="shrink-0">In case</span>
      <div className="flex items-center gap-0.5 rounded-btn border border-border bg-bg p-0.5">
        <motion.button
          type="button"
          aria-label="Fewer copies in case"
          disabled={locked || atMin}
          whileTap={locked || atMin ? undefined : { scale: 0.88 }}
          transition={{ duration: 0.16, ease: EASE_PREMIUM }}
          onClick={() => step(-1)}
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-40"
        >
          <Minus className="size-3.5" aria-hidden />
        </motion.button>
        <span
          className={cx(
            'relative inline-grid h-7 min-w-8 place-items-center overflow-hidden text-center text-xs font-bold tabular-nums text-fg',
            pending && 'opacity-70',
          )}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.span
              key={quantity}
              custom={direction}
              variants={{
                enter: (dir: 1 | -1) => ({ y: dir > 0 ? 16 : -16, opacity: 0 }),
                center: { y: 0, opacity: 1 },
                exit: (dir: 1 | -1) => ({ y: dir > 0 ? -16 : 16, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: EASE_PREMIUM }}
              className="col-start-1 row-start-1"
            >
              {quantity}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.button
          type="button"
          aria-label="More copies in case"
          disabled={locked || atMax}
          title={atMax ? `Max ${max} from current on-hand stock` : undefined}
          whileTap={locked || atMax ? undefined : { scale: 0.88 }}
          transition={{ duration: 0.16, ease: EASE_PREMIUM }}
          onClick={() => step(1)}
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden />
        </motion.button>
      </div>
    </div>
  )
}

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
            <CaseEditor key={storeCase.id} slug={slug} storeCase={storeCase} cases={cases!} />
          ))}
        </div>
      )}
    </div>
  )
}

function CaseEditor({
  slug,
  storeCase,
  cases,
}: {
  slug: string
  storeCase: StoreCaseSummary
  cases: StoreCaseSummary[]
}) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: storeCasesKey(slug) })
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<StoreSectionMode>('auto')
  const [sectionOrder, setSectionOrder] = useState(() => storeCase.sections.map((section) => section.id))
  const sectionOrderRef = useRef(sectionOrder)
  const orderDirtyRef = useRef(false)

  const sectionIdsKey = storeCase.sections.map((section) => section.id).join(',')
  useEffect(() => {
    if (orderDirtyRef.current) return
    setSectionOrder(storeCase.sections.map((section) => section.id))
  }, [sectionIdsKey, storeCase.sections])

  useEffect(() => {
    sectionOrderRef.current = sectionOrder
  }, [sectionOrder])

  const sectionsById = useMemo(() => {
    const map = new Map<number, StoreSection>()
    for (const section of storeCase.sections) map.set(section.id, section)
    return map
  }, [storeCase.sections])

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

  const reorderSections = useMutation({
    mutationFn: async (sectionIds: number[]) => {
      const { data } = await api.put<StoreCaseSummary>(
        `/stores/${slug}/cases/${storeCase.id}/sections/reorder`,
        { sectionIds },
      )
      return data
    },
    onMutate: async (sectionIds) => {
      orderDirtyRef.current = false
      const key = storeCasesKey(slug)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<StoreCaseSummary[]>(key)
      queryClient.setQueryData<StoreCaseSummary[]>(key, (casesData) => {
        if (!casesData) return casesData
        return casesData.map((row) => {
          if (row.id !== storeCase.id) return row
          const byId = new Map(row.sections.map((section) => [section.id, section]))
          const sections = sectionIds
            .map((id, position) => {
              const section = byId.get(id)
              return section ? { ...section, position } : null
            })
            .filter((section): section is StoreSection => section != null)
          return { ...row, sections }
        })
      })
      return { previous }
    },
    onError: (_error, _ids, context) => {
      orderDirtyRef.current = false
      if (context?.previous) queryClient.setQueryData(storeCasesKey(slug), context.previous)
    },
    onSettled: () => {
      orderDirtyRef.current = false
      void queryClient.invalidateQueries({ queryKey: storeCasesKey(slug) })
    },
  })

  function applySectionOrder(next: number[]) {
    orderDirtyRef.current = true
    setSectionOrder(next)
    queryClient.setQueryData<StoreCaseSummary[]>(storeCasesKey(slug), (casesData) => {
      if (!casesData) return casesData
      return casesData.map((row) => {
        if (row.id !== storeCase.id) return row
        const byId = new Map(row.sections.map((section) => [section.id, section]))
        const sections = next
          .map((id, position) => {
            const section = byId.get(id)
            return section ? { ...section, position } : null
          })
          .filter((section): section is StoreSection => section != null)
        return { ...row, sections }
      })
    })
  }

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
      {reorderSections.isError && (
        <p className="text-sm font-medium text-danger-700" role="alert">
          {extractErrorMessage(reorderSections.error, 'Could not reorder sections.')}
        </p>
      )}

      {sectionOrder.length === 0 ? (
        <p className="text-sm text-fg-muted">No sections yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {sectionOrder.length > 1 ? (
            <p className="text-xs text-fg-muted">Drag the grip handle to reorder sections on the Case Cards page.</p>
          ) : null}
          <Reorder.Group
            axis="y"
            values={sectionOrder}
            onReorder={applySectionOrder}
            className="flex list-none flex-col gap-6 p-0"
            as="div"
          >
            {sectionOrder.map((sectionId) => {
              const section = sectionsById.get(sectionId)
              if (!section) return null
              return (
                <SortableSectionEditor
                  key={section.id}
                  slug={slug}
                  section={section}
                  cases={cases}
                  onChanged={invalidate}
                  onDragEnd={() => {
                    if (!orderDirtyRef.current) return
                    reorderSections.mutate(sectionOrderRef.current)
                  }}
                />
              )
            })}
          </Reorder.Group>
        </div>
      )}
    </section>
  )
}

function SortableSectionEditor({
  slug,
  section,
  cases,
  onChanged,
  onDragEnd,
}: {
  slug: string
  section: StoreSection
  cases: StoreCaseSummary[]
  onChanged: () => void
  onDragEnd: () => void
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={section.id}
      as="div"
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative"
      style={{ position: 'relative' }}
    >
      <SectionEditor
        slug={slug}
        section={section}
        cases={cases}
        onChanged={onChanged}
        dragHandle={
          <button
            type="button"
            aria-label={`Drag to reorder ${section.title}`}
            className="grid size-8 touch-none cursor-grab place-items-center rounded-lg text-fg-muted hover:bg-bg hover:text-fg active:cursor-grabbing"
            onPointerDown={(event) => controls.start(event)}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        }
      />
    </Reorder.Item>
  )
}

function SectionEditor({
  slug,
  section,
  cases,
  onChanged,
  dragHandle,
}: {
  slug: string
  section: StoreSection
  cases: StoreCaseSummary[]
  onChanged: () => void
  dragHandle?: ReactNode
}) {
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pullSheetOpen, setPullSheetOpen] = useState(false)
  const [stockingSheetOpen, setStockingSheetOpen] = useState(false)
  const toStockCount = section.cards.filter(
    (entry) => entry.needsStocking && (entry.inventoryItem.quantity ?? 0) > 0,
  ).length
  const visibleCards = section.cards.filter((entry) => (entry.inventoryItem.quantity ?? 0) > 0)
  const [min, setMin] = useState(section.autoMinPriceCents != null ? (section.autoMinPriceCents / 100).toFixed(2) : '')
  const [max, setMax] = useState(section.autoMaxPriceCents != null ? (section.autoMaxPriceCents / 100).toFixed(2) : '')
  const [rarity, setRarity] = useState(section.autoRarity ?? '')
  const [color, setColor] = useState(() => colorFilterSelectValue(section))
  const [setCode, setSetCode] = useState(section.autoSetCode ?? '')
  const [cardType, setCardType] = useState(section.autoCardType ?? '')
  const [cardLimit, setCardLimit] = useState(section.cardLimit != null ? String(section.cardLimit) : '')

  useEffect(() => {
    setColor(colorFilterSelectValue(section))
  }, [section.id, section.autoColorIdentity, section.autoColorIdentityLabel])

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
    onMutate: async ({ cardId, quantity: nextQty }) => {
      const key = storeCasesKey(slug)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<StoreCaseSummary[]>(key)

      queryClient.setQueryData<StoreCaseSummary[]>(key, (casesData) => {
        if (!casesData) return casesData
        return casesData.map((storeCase) => ({
          ...storeCase,
          sections: storeCase.sections.map((sec) => {
            if (sec.id !== section.id) return sec
            let availableDelta = 0
            const cards = sec.cards.map((entry) => {
              if (entry.id !== cardId) return entry
              const nextQuantity = Math.max(entry.soldQuantity, nextQty)
              const nextRemaining = Math.max(0, nextQuantity - entry.soldQuantity)
              availableDelta += nextRemaining - entry.remaining
              const toppedUp = nextQuantity > entry.quantity
              return {
                ...entry,
                quantity: nextQuantity,
                remaining: nextRemaining,
                needsStocking: toppedUp ? true : entry.needsStocking,
                stockedAt: toppedUp ? null : entry.stockedAt,
              }
            })
            return {
              ...sec,
              cards,
              availableQuantity: Math.max(0, sec.availableQuantity + availableDelta),
            }
          }),
        }))
      })

      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(storeCasesKey(slug), context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: storeCasesKey(slug) })
    },
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

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {dragHandle}
            <span>{section.title}</span>
          </span>
        }
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
              <Select label="Color / identity" value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="">Any color</option>
                {COLOR_SUGGESTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {color && !(COLOR_SUGGESTIONS as readonly string[]).includes(color) ? (
                  <option value={color}>{color}</option>
                ) : null}
              </Select>
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
              <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Add cards from inventory
              </Button>
              {section.autoColorIdentityLabel && (
                <span className="text-xs text-fg-muted">
                  Color filter: <span className="font-bold text-fg">{section.autoColorIdentityLabel}</span>
                </span>
              )}
              <span className="text-xs text-fg-muted">
                Pulls 1 copy per card; cards already promised to other sections are skipped. Re-pull any time. Sold cards stay tracked. You can also search and add or remove specific cards below.
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
              {visibleCards.length} in section
              {section.cardLimit != null ? ` · limit ${section.cardLimit}` : ''}
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

        {visibleCards.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {section.mode === 'auto'
              ? 'No cards yet. Set your filters and pull from inventory.'
              : 'No cards yet. Add some from your inventory.'}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((entry) => {
              const card = entry.inventoryItem.card
              const onHand = entry.inventoryItem.quantity ?? 0
              const free = freeCaseCopies(cases, entry.inventoryItem.id, onHand, section.id)
              const maxInCase = entry.soldQuantity + free
              return (
                <li
                  key={entry.id}
                  className={`relative flex gap-3 rounded-card border border-border bg-surface p-2 ${entry.remaining === 0 ? 'opacity-75' : ''}`}
                >
                  {card && cardImage(card) && (
                    <img src={cardImage(card)} alt={card.name} className="h-16 w-12 flex-shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">{card?.name ?? 'Unknown card'}</p>
                    <p className="text-xs text-fg-muted">
                      {card?.setCode?.toUpperCase()} · {formatPrice(entry.inventoryItem.priceCents)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <CasePoolQuantityInput
                        quantity={entry.quantity}
                        min={entry.soldQuantity}
                        max={maxInCase}
                        pending={updatePool.isPending && updatePool.variables?.cardId === entry.id}
                        onCommit={(quantity) => updatePool.mutate({ cardId: entry.id, quantity })}
                      />
                      {entry.needsStocking && <Badge tone="warning">Needs stocking</Badge>}
                    </div>
                    {updatePool.isError && updatePool.variables?.cardId === entry.id ? (
                      <p className="mt-1 text-xs font-medium text-danger-700" role="alert">
                        {extractErrorMessage(updatePool.error, 'Could not update case copies.')}
                      </p>
                    ) : null}
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
        <InventoryPicker
          slug={slug}
          section={section}
          cases={cases}
          onClose={() => setPickerOpen(false)}
          onChanged={onChanged}
        />
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
  cases,
  onClose,
  onChanged,
}: {
  slug: string
  section: StoreSection
  cases: StoreCaseSummary[]
  onClose: () => void
  onChanged: () => void
}) {
  const { data: storeGames = [] } = useStoreGames(slug)
  const [game, setGame] = useState('')
  const [query, setQuery] = useState('')
  const [pickedCard, setPickedCard] = useState<CardSummary | null>(null)
  const [typeaheadOpen, setTypeaheadOpen] = useState(false)
  const [qtyByItem, setQtyByItem] = useState<Record<number, number>>({})
  const typeaheadRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const debounced = useDebouncedValue(query.trim(), 300)

  useEffect(() => {
    if (!game && storeGames.length > 0) {
      setGame(storeGames[0].code)
    }
  }, [game, storeGames])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (typeaheadRef.current && !typeaheadRef.current.contains(event.target as Node)) {
        setTypeaheadOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const alreadyIn = useMemo(
    () => new Set(section.cards.map((c) => c.inventoryItem.id)),
    [section.cards],
  )

  // Same ranked catalog typeahead as Singles → Add (prefix / exact / word tiers).
  const typeaheadReady = debounced.length >= 2 && Boolean(game) && !pickedCard
  const { data: typeaheadResults = [], isFetching: typeaheadFetching } = useQuery({
    queryKey: ['card-search', 'typeahead', 'section-picker', debounced, game],
    queryFn: async () => {
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: debounced,
          unique: 'cards',
          game,
        },
      })
      return data.slice(0, 12)
    },
    enabled: typeaheadReady,
    staleTime: 30_000,
  })

  const typeaheadNames = useMemo(() => {
    const seen = new Set<string>()
    return [...typeaheadResults]
      .filter((card) => {
        const key = foldSearchText(card.name)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((left, right) => typeaheadNameTier(left.name, debounced) - typeaheadNameTier(right.name, debounced))
  }, [typeaheadResults, debounced])

  const inventoryQuery = pickedCard?.name ?? (debounced.length >= 2 ? debounced : '')
  // Case sections can include zero-qty listings for the stocking sheet.
  const { data: searchPage, isFetching: isLoading } = useInventoryPage(slug, {
    q: inventoryQuery,
    game: game || undefined,
    inStockOnly: false,
    itemsPerPage: 60,
    enabled: inventoryQuery !== '' && Boolean(game),
  })

  const results = useMemo(() => {
    const items = searchPage?.items ?? []
    const q = inventoryQuery
    const ranked = [...items].sort(
      (a, b) =>
        typeaheadNameTier(a.card.name, q) - typeaheadNameTier(b.card.name, q) ||
        a.card.name.localeCompare(b.card.name) ||
        a.id - b.id,
    )
    if (!pickedCard) return ranked
    const exact = ranked.filter((item) => catalogNamesMatch(item.card.name, pickedCard.name))
    return exact.length > 0 ? exact : ranked
  }, [searchPage?.items, inventoryQuery, pickedCard])

  const addMutation = useMutation({
    mutationFn: async ({ inventoryItemId, quantity }: { inventoryItemId: number; quantity: number }) => {
      await api.post(`/stores/${slug}/sections/${section.id}/items`, { inventoryItemId, quantity })
      return inventoryItemId
    },
    onSuccess: () => {
      onChanged()
    },
  })

  function freeForListing(itemId: number, onHand: number | null | undefined): number {
    return freeCaseCopies(cases, itemId, onHand ?? 0, section.id)
  }

  function quantityFor(itemId: number, free: number): number {
    if (free < 1) return 1
    const preferred = qtyByItem[itemId] ?? 1
    return Math.min(free, Math.max(1, preferred))
  }

  function setQuantityFor(itemId: number, next: number, free: number) {
    if (free < 1) return
    setQtyByItem((prev) => ({ ...prev, [itemId]: Math.min(free, Math.max(1, next)) }))
  }

  function pickCatalogCard(card: CardSummary) {
    setQuery(card.name)
    setPickedCard(card)
    setTypeaheadOpen(false)
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function clearPickedCard() {
    setPickedCard(null)
    setTypeaheadOpen(true)
  }

  function onQueryChange(value: string) {
    setQuery(value)
    setPickedCard(null)
    setTypeaheadOpen(true)
  }

  const showTypeahead = typeaheadOpen && typeaheadReady && typeaheadNames.length > 0
  const pickedImage = pickedCard ? cardImage(pickedCard) : undefined
  const primaryListing = results[0] ?? null
  const primaryAdded = primaryListing ? alreadyIn.has(primaryListing.id) : false
  const primaryFree = primaryListing ? freeForListing(primaryListing.id, primaryListing.quantity) : 0
  const primaryQty = primaryListing ? quantityFor(primaryListing.id, primaryFree) : 1

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add cards to “${section.title}”`}
      className="max-w-5xl min-h-[min(42rem,90vh)]"
    >
      <div className="flex min-h-[min(32rem,70vh)] flex-col gap-4">
        {storeGames.length > 1 && (
          <Select label="Game" value={game} onChange={(e) => {
            setGame(e.target.value)
            setPickedCard(null)
          }}>
            {storeGames.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </Select>
        )}
        <div ref={typeaheadRef} className="relative shrink-0">
          <Input
            label="Search inventory"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              if (!pickedCard) setTypeaheadOpen(true)
            }}
            placeholder="Card name (same search as Singles)…"
            autoFocus
          />
          {showTypeahead && (
            <ul
              role="listbox"
              className={cx(
                dropdownPanelClass,
                'absolute left-0 right-0 z-20 mt-1 max-h-[min(28rem,50vh)] overflow-y-auto p-1.5',
              )}
            >
              {typeaheadNames.map((card) => {
                const image = cardImage(card)
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      role="option"
                      className={cx(dropdownItemClass({}), 'w-full gap-3 py-2.5 text-left')}
                      onClick={() => pickCatalogCard(card)}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-20 w-14 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="h-20 w-14 shrink-0 rounded bg-bg" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{card.name}</span>
                      <span className="shrink-0 text-sm text-fg-muted">{card.setCode?.toUpperCase()}</span>
                      <span className="shrink-0 text-sm font-semibold text-brand-600">Select</span>
                    </button>
                  </li>
                )
              })}
              {typeaheadFetching && (
                <li className="px-2.5 py-1.5 text-xs text-fg-muted">Searching…</li>
              )}
            </ul>
          )}
        </div>

        <div ref={resultsRef} className="min-h-0 flex-1 space-y-4">
          {pickedCard && (
            <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center">
              {pickedImage ? (
                <img
                  src={pickedImage}
                  alt={pickedCard.name}
                  className="mx-auto h-40 w-[7.15rem] shrink-0 rounded-card object-cover sm:mx-0"
                />
              ) : (
                <span className="mx-auto h-40 w-[7.15rem] shrink-0 rounded-card bg-bg sm:mx-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Selected card</p>
                <p className="text-xl font-bold text-fg">{pickedCard.name}</p>
                <p className="text-sm text-fg-muted">
                  {[pickedCard.setCode?.toUpperCase(), pickedCard.setName].filter(Boolean).join(' · ') || 'Catalog match'}
                  {primaryListing
                    ? ` · ${primaryListing.card.setCode?.toUpperCase() ?? '—'} · ${formatPrice(primaryListing.priceCents)} · ${primaryListing.quantity ?? 0} in stock · ${primaryFree} free for cases`
                    : ' · Choose a store listing below to add it to this case section.'}
                </p>
                {addMutation.isError && (
                  <p className="text-sm font-medium text-danger-700" role="alert">
                    {extractErrorMessage(addMutation.error, 'Could not add that card to the case.')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 self-center sm:items-end">
                {primaryListing && !primaryAdded && primaryFree > 0 ? (
                  <label className="flex items-center justify-end gap-2 text-sm text-fg-muted">
                    Copies
                    <input
                      type="number"
                      min={1}
                      max={primaryFree}
                      value={primaryQty}
                      onChange={(e) => setQuantityFor(primaryListing.id, Number(e.target.value) || 1, primaryFree)}
                      className="w-16 rounded-btn border border-border bg-surface px-2 py-1 text-fg"
                    />
                  </label>
                ) : null}
                {primaryListing && (
                  <Button
                    type="button"
                    variant={primaryAdded ? 'ghost' : 'primary'}
                    disabled={primaryAdded || primaryFree < 1}
                    loading={addMutation.isPending && addMutation.variables?.inventoryItemId === primaryListing.id}
                    onClick={() =>
                      addMutation.mutate({ inventoryItemId: primaryListing.id, quantity: primaryQty })
                    }
                  >
                    {primaryAdded ? 'In case' : primaryFree < 1 ? 'No free copies' : 'Add to case'}
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={clearPickedCard}>
                  Change
                </Button>
              </div>
            </div>
          )}

          {inventoryQuery === '' ? (
            <p className="text-sm text-fg-muted">Type at least 2 characters, then select a card to add from stock.</p>
          ) : isLoading ? (
            <LoadingPanel />
          ) : results.length === 0 ? (
            <EmptyState
              icon={Search}
              title={pickedCard ? 'Not in inventory' : 'No matching listings'}
              description={
                pickedCard
                  ? `${pickedCard.name} isn’t in this store’s inventory. Import or add the listing in Singles first.`
                  : 'Try another name, or pick a suggestion from the catalog search above.'
              }
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-bold text-fg">
                  {pickedCard ? `Store listings · ${pickedCard.name}` : 'Matching stock'}
                </h3>
                <p className="text-xs text-fg-muted">{results.length} listing{results.length === 1 ? '' : 's'}</p>
              </div>
              <ul className="max-h-[min(36rem,55vh)] space-y-2.5 overflow-y-auto">
                {results.map((item) => {
                  const added = alreadyIn.has(item.id)
                  const image = cardImage(item.card)
                  const free = freeForListing(item.id, item.quantity)
                  const qty = quantityFor(item.id, free)
                  return (
                    <li key={item.id} className="flex items-center gap-4 rounded-card border border-border bg-surface p-3">
                      {image ? (
                        <img
                          src={image}
                          alt={item.card.name}
                          loading="lazy"
                          decoding="async"
                          className="h-24 w-[4.25rem] flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="h-24 w-[4.25rem] flex-shrink-0 rounded bg-bg" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-fg">{item.card.name}</p>
                        <p className="text-sm text-fg-muted">
                          {item.card.setCode?.toUpperCase()} · {formatPrice(item.priceCents)}
                          {item.isFoil ? ` · ${item.finish}` : ''}
                          {` · ${item.quantity ?? 0} in stock · ${free} free for cases`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                        {!added && free > 0 ? (
                          <label className="flex items-center gap-1 text-xs text-fg-muted">
                            Copies
                            <input
                              type="number"
                              min={1}
                              max={free}
                              value={qty}
                              onChange={(e) => setQuantityFor(item.id, Number(e.target.value) || 1, free)}
                              className="w-14 rounded-btn border border-border bg-surface px-1 py-0.5 text-fg"
                            />
                          </label>
                        ) : null}
                        <Button
                          size="sm"
                          variant={added ? 'ghost' : 'primary'}
                          disabled={added || free < 1}
                          loading={addMutation.isPending && addMutation.variables?.inventoryItemId === item.id}
                          onClick={() => addMutation.mutate({ inventoryItemId: item.id, quantity: qty })}
                        >
                          {added ? 'In case' : free < 1 ? 'No free copies' : 'Add to case'}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
