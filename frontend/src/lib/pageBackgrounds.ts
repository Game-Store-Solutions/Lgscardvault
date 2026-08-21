export const PAGE_BACKGROUND_PRESETS = [
  // Keep in sync with StoreSettingsUpdater::$presets (PHP)
  'none',
  'noise',
  'waves',
  'aurora',
  'grid',
  'animated-grid',
  'interactive-grid',
] as const

export type PageBackgroundPreset = (typeof PAGE_BACKGROUND_PRESETS)[number]

/** Presets removed from the picker — existing stores fall back to solid. */
const DEPRECATED_PRESETS = new Set(['dot', 'light-rays', 'striped', 'ripple', 'hexagon'])

export interface PageBackgroundThemeColors {
  /** Primary pattern tint — empty uses brand primary. */
  primary?: string | null
  /** Secondary pattern tint — empty uses brand accent. */
  secondary?: string | null
  /** Soft base wash for animated backgrounds (waves, aurora). */
  base?: string | null
}

export interface StorePageBackgrounds {
  light: PageBackgroundPreset
  /** When null, dark mode uses the light preset. */
  dark?: PageBackgroundPreset | null
  /** Pattern strength 0–100. */
  opacity?: number | null
  /** Optional per-theme pattern colors. */
  colors?: {
    light?: PageBackgroundThemeColors | null
    dark?: PageBackgroundThemeColors | null
  } | null
}

export const PAGE_BACKGROUND_DEFAULTS: StorePageBackgrounds = {
  light: 'none',
  dark: null,
  opacity: 72,
}

export const PAGE_BACKGROUND_LABELS: Record<PageBackgroundPreset, string> = {
  none: 'Solid only',
  noise: 'Film grain',
  waves: 'Hero waves',
  aurora: 'Aurora glow',
  grid: 'Spot grid',
  'animated-grid': 'Animated grid',
  'interactive-grid': 'Interactive grid',
}

const HEX = /^#[0-9a-fA-F]{6}$/

function isPageBackgroundPreset(value: unknown): value is PageBackgroundPreset {
  return typeof value === 'string' && (PAGE_BACKGROUND_PRESETS as readonly string[]).includes(value)
}

function normalizePreset(value: unknown): PageBackgroundPreset {
  if (typeof value === 'string' && DEPRECATED_PRESETS.has(value)) return 'none'
  if (isPageBackgroundPreset(value)) return value
  return PAGE_BACKGROUND_DEFAULTS.light
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return undefined
  return HEX.test(trimmed) ? trimmed : undefined
}

function normalizeThemeColors(input?: PageBackgroundThemeColors | null): PageBackgroundThemeColors {
  if (!input || typeof input !== 'object') return {}
  const out: PageBackgroundThemeColors = {}
  const primary = normalizeHex(input.primary)
  const secondary = normalizeHex(input.secondary)
  const base = normalizeHex(input.base)
  if (primary) out.primary = primary
  if (secondary) out.secondary = secondary
  if (base) out.base = base
  return out
}

function normalizeColorsBlock(
  input?: StorePageBackgrounds['colors'],
): StorePageBackgrounds['colors'] {
  if (!input || typeof input !== 'object') return undefined
  const light = normalizeThemeColors(input.light)
  const dark = normalizeThemeColors(input.dark)
  const colors: NonNullable<StorePageBackgrounds['colors']> = {}
  if (Object.keys(light).length > 0) colors.light = light
  if (Object.keys(dark).length > 0) colors.dark = dark
  return Object.keys(colors).length > 0 ? colors : undefined
}

/** Saved pattern colors for one theme (form editing — no inherit). */
export function getSavedBackgroundColors(
  settings: Partial<StorePageBackgrounds> | null | undefined,
  theme: 'light' | 'dark',
): PageBackgroundThemeColors {
  const block = settings?.colors?.[theme]
  if (!block || typeof block !== 'object') return {}
  const out: PageBackgroundThemeColors = {}
  if (typeof block.primary === 'string' && block.primary.trim()) out.primary = block.primary.trim()
  if (typeof block.secondary === 'string' && block.secondary.trim()) out.secondary = block.secondary.trim()
  if (typeof block.base === 'string' && block.base.trim()) out.base = block.base.trim()
  return out
}

/** Pattern colors used when rendering (dark inherits light when unset). */
export function resolvePatternColorsForRender(
  settings: StorePageBackgrounds | null | undefined,
  isDark: boolean,
): PageBackgroundThemeColors {
  const resolved = resolvePageBackgrounds(settings)
  const themeKey = isDark ? 'dark' : 'light'
  const themeColors = resolved.colors?.[themeKey]
  if (themeColors && Object.keys(themeColors).length > 0) return themeColors
  if (isDark && resolved.colors?.light && Object.keys(resolved.colors.light).length > 0) {
    return resolved.colors.light
  }
  return {}
}

export function clampBackgroundOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return PAGE_BACKGROUND_DEFAULTS.opacity ?? 72
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function resolvePageBackgrounds(input?: Partial<StorePageBackgrounds> | null): StorePageBackgrounds {
  const light = normalizePreset(input?.light)
  const darkRaw = input?.dark
  const dark =
    darkRaw === null || darkRaw === undefined
      ? null
      : normalizePreset(darkRaw)
  return {
    light,
    dark: dark === light ? null : dark,
    opacity: clampBackgroundOpacity(input?.opacity),
    colors: normalizeColorsBlock(input?.colors),
  }
}

export function resolveActiveBackgroundPreset(
  settings: StorePageBackgrounds | null | undefined,
  isDark: boolean,
): PageBackgroundPreset {
  const resolved = resolvePageBackgrounds(settings)
  if (isDark && resolved.dark) return resolved.dark
  return resolved.light
}

/** CSS vars for pattern layers; unset keys inherit brand palette via fallbacks in CSS. */
export function patternColorStyle(colors: PageBackgroundThemeColors): Record<string, string> {
  const style: Record<string, string> = {}
  if (colors.primary) style['--page-bg-pattern-primary'] = colors.primary
  if (colors.secondary) style['--page-bg-pattern-secondary'] = colors.secondary
  if (colors.base) style['--page-bg-pattern-base'] = colors.base
  return style
}
