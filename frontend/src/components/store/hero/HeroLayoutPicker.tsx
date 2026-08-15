import { useId, useState } from 'react'
import { ChevronDown, LayoutTemplate, Sparkles, Star, type LucideIcon } from 'lucide-react'
import type { HeroLayout } from '../../../api/types'
import { cx } from '../../../lib/cx'
import { HERO_LAYOUT_OPTIONS, type HeroLayoutOption } from './heroLayouts'

export interface HeroLayoutCategory {
  id: string
  title: string
  subtitle: string
  layoutIds: HeroLayout[]
  featured?: boolean
  defaultOpen?: boolean
}

const OPTION_BY_ID = Object.fromEntries(HERO_LAYOUT_OPTIONS.map((o) => [o.id, o])) as Record<
  HeroLayout,
  HeroLayoutOption
>

export const HERO_LAYOUT_CATEGORIES: HeroLayoutCategory[] = [
  {
    id: 'hero-styles',
    title: 'Storefront hero',
    subtitle: 'Pick how your header feels. Classic photo, playmat, events, motion, or live stock.',
    featured: true,
    defaultOpen: true,
    layoutIds: HERO_LAYOUT_OPTIONS.map((o) => o.id),
  },
]

function layoutIcon(option: HeroLayoutOption): LucideIcon {
  if (option.featured) return Star
  if (option.id === 'floating-cards') return Sparkles
  return LayoutTemplate
}

function HeroLayoutChoice({
  option,
  selected,
  disabled,
  onClick,
}: {
  option: HeroLayoutOption
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const Icon = layoutIcon(option)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cx(
        'flex gap-3 rounded-card border p-3 text-left transition-colors sm:p-4',
        selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border bg-surface text-fg hover:border-brand-500',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-btn bg-surface text-brand-600 sm:size-10">
        {option.emoji ? (
          <span className="text-lg" aria-hidden>
            {option.emoji}
          </span>
        ) : (
          <Icon aria-hidden className="size-4 sm:size-5" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-sm font-bold sm:text-base">{option.title}</span>
        <span className={cx('mt-0.5 line-clamp-2 block text-xs sm:text-sm', selected ? 'text-brand-700' : 'text-fg-muted')}>
          {option.description}
        </span>
      </span>
    </button>
  )
}

function HeroLayoutCategoryAccordion({
  category,
  open,
  onOpenChange,
  selectedLayout,
  disabled,
  onSelect,
}: {
  category: HeroLayoutCategory
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedLayout: HeroLayout
  disabled?: boolean
  onSelect: (layout: HeroLayout) => void
}) {
  const panelId = useId()
  const options = category.layoutIds.map((id) => OPTION_BY_ID[id]).filter(Boolean)

  return (
    <div className="rounded-xl border border-border bg-bg/40">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-bg/60 sm:px-4"
        onClick={() => onOpenChange(!open)}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {category.featured ? (
              <Star aria-hidden className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />
            ) : null}
            <span className="text-sm font-bold text-fg">{category.title}</span>
            <span className="text-xs font-medium text-fg-muted">({options.length})</span>
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-fg-muted">{category.subtitle}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cx('mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id={panelId} className="space-y-2 border-t border-border px-3.5 pb-3.5 pt-2 sm:px-4 sm:pb-4">
          {options.map((option) => (
            <HeroLayoutChoice
              key={option.id}
              option={option}
              selected={selectedLayout === option.id}
              disabled={disabled}
              onClick={() => onSelect(option.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function HeroLayoutPicker({
  selectedLayout,
  disabled,
  onSelect,
}: {
  selectedLayout: HeroLayout
  disabled?: boolean
  onSelect: (layout: HeroLayout) => void
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(HERO_LAYOUT_CATEGORIES.map((c) => [c.id, c.defaultOpen ?? false])),
  )

  return (
    <div className="space-y-3">
      {HERO_LAYOUT_CATEGORIES.map((category) => (
        <HeroLayoutCategoryAccordion
          key={category.id}
          category={category}
          open={openMap[category.id] ?? false}
          onOpenChange={(next) => setOpenMap((current) => ({ ...current, [category.id]: next }))}
          selectedLayout={selectedLayout}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
