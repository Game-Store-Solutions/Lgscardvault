/* eslint-disable react-refresh/only-export-components */
import { useId, useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { cx } from '../../lib/cx'
import { Field, Input } from '../ui'
import { THEME_PRESET_CATEGORIES, type ThemePresetCategory } from './themePresets'
import { PALETTE_DEFAULTS, type Palette, type PaletteKey, type ThemePreset } from './brandingTypes'

export const HEX = /^#[0-9a-fA-F]{6}$/

export { PALETTE_DEFAULTS }
export type { PaletteKey, Palette, ThemePreset }

export { THEME_PRESETS, THEME_PRESET_CATEGORIES, findThemePresetById } from './themePresets'
export { DARK_THEME_PRESETS, DARK_THEME_PRESET_CATEGORIES, findDarkThemePresetById } from './darkThemePresets'
export { pickHeroBrandingPayload, sanitizeBrandingPayload } from './brandingPayload'

export function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string
  fallback: string
  onChange: (value: string) => void
}) {
  return (
    <Field label={label} hint="6-digit hex, e.g. #6d5efc">
      {({ id }) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} swatch`}
            value={HEX.test(value) ? value : fallback}
            onChange={(e) => onChange(e.target.value)}
            className="size-10 flex-shrink-0 cursor-pointer rounded-btn border border-border bg-surface p-1"
          />
          <Input id={id} value={value} placeholder={fallback} onChange={(e) => onChange(e.target.value)} className="font-mono" />
        </div>
      )}
    </Field>
  )
}

const SWATCH_KEYS: PaletteKey[] = ['backgroundColor', 'surfaceColor', 'primaryColor', 'accentColor', 'textColor']

/** One-click palette swatch button used by the presets grid. */
export function ThemePresetButton({
  preset,
  onSelect,
  compact,
}: {
  preset: ThemePreset
  onSelect: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group rounded-card border border-border p-3 text-left transition-colors hover:border-brand-500 hover:bg-bg/50"
    >
      <span className="flex h-10 overflow-hidden rounded-btn border border-border">
        {SWATCH_KEYS.map((key) => (
          <span key={key} className="flex-1" style={{ backgroundColor: preset.palette[key] }} />
        ))}
      </span>
      <span className="mt-2 block text-sm font-bold text-fg">{preset.name}</span>
      {!compact && preset.description ? (
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-fg-muted">{preset.description}</span>
      ) : null}
    </button>
  )
}

function ThemePresetAccordion({
  category,
  open,
  onOpenChange,
  onSelect,
}: {
  category: ThemePresetCategory
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (preset: ThemePreset) => void
}) {
  const panelId = useId()

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
            <span className="text-xs font-medium text-fg-muted">({category.presets.length})</span>
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-fg-muted">{category.subtitle}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cx('mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border px-3.5 pb-3.5 pt-2 sm:px-4 sm:pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {category.presets.map((preset) => (
              <ThemePresetButton
                key={preset.id ?? preset.name}
                preset={preset}
                compact={category.presets.length > 6}
                onSelect={() => onSelect(preset)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Categorized accordion picker for store theme palettes. */
export function ThemePresetPicker({
  categories = THEME_PRESET_CATEGORIES,
  instanceId = 'light',
  onSelect,
}: {
  categories?: ThemePresetCategory[]
  /** Disambiguates accordion open state when multiple pickers share a page. */
  instanceId?: string
  onSelect: (preset: ThemePreset) => void
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.map((c) => [`${instanceId}:${c.id}`, c.defaultOpen ?? false])),
  )

  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const key = `${instanceId}:${category.id}`
        return (
          <ThemePresetAccordion
            key={key}
            category={category}
            open={openMap[key] ?? false}
            onOpenChange={(next) => setOpenMap((current) => ({ ...current, [key]: next }))}
            onSelect={onSelect}
          />
        )
      })}
    </div>
  )
}

/** Apply a dark-theme preset to `darkColors` only (light palette unchanged). */
export function mergeDarkThemePreset<T extends { darkColors: Partial<Palette> }>(
  current: T,
  preset: ThemePreset,
  emptyDark: Partial<Palette>,
): T {
  return {
    ...current,
    darkColors: { ...emptyDark, ...current.darkColors, ...preset.palette },
  }
}

/** Merge a preset into branding form state (including optional dark palette). */
export function mergeThemePreset<T extends Palette & { darkColors?: Partial<Palette> }>(
  current: T,
  preset: ThemePreset,
  emptyDark: Partial<Palette>,
): T {
  return {
    ...current,
    ...preset.palette,
    ...(preset.darkPalette
      ? {
          darkColors: { ...emptyDark, ...current.darkColors, ...preset.darkPalette },
        }
      : {}),
  }
}
