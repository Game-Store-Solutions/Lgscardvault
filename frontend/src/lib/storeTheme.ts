/**
 * storeThemeVars — turns a store's (possibly partial) branding palette into a
 * complete, readable set of design-token CSS variable overrides.
 *
 * The key idea: never trust a partial palette to be legible. We detect whether
 * the theme is dark (from the background, or surface as a fallback) and derive
 * any unset neutrals — surface, text, muted, border — so text never lands
 * dark-on-dark. The brand ramp also flips direction for dark themes so links,
 * badges, and active states stay legible. Explicitly-set colors always win.
 */

const HEX = /^#[0-9a-fA-F]{6}$/

export const SURFACE_STYLE_DEFAULTS = {
  borderThickness: 1,
  surfaceBlur: 12,
  borderGlow: 0,
} as const

export const SURFACE_STYLE_RANGES = {
  borderThickness: { min: 0, max: 8 },
  surfaceBlur: { min: 0, max: 40 },
  borderGlow: { min: 0, max: 40 },
} as const

export const FRAME_KEYS = ['hero', 'tile', 'card'] as const
export type FrameKey = (typeof FRAME_KEYS)[number]

export interface FrameStyle {
  borderThickness: number
  borderGlow: number
  surfaceBlur: number
}

export type FrameStyles = Record<FrameKey, FrameStyle>

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function clampBorderThickness(value: unknown): number {
  return clampInt(
    value,
    SURFACE_STYLE_RANGES.borderThickness.min,
    SURFACE_STYLE_RANGES.borderThickness.max,
    SURFACE_STYLE_DEFAULTS.borderThickness,
  )
}

export function clampSurfaceBlur(value: unknown): number {
  return clampInt(
    value,
    SURFACE_STYLE_RANGES.surfaceBlur.min,
    SURFACE_STYLE_RANGES.surfaceBlur.max,
    SURFACE_STYLE_DEFAULTS.surfaceBlur,
  )
}

export function clampBorderGlow(value: unknown): number {
  return clampInt(
    value,
    SURFACE_STYLE_RANGES.borderGlow.min,
    SURFACE_STYLE_RANGES.borderGlow.max,
    SURFACE_STYLE_DEFAULTS.borderGlow,
  )
}

export function defaultFrameStyle(partial?: Partial<FrameStyle> | null): FrameStyle {
  return {
    borderThickness: clampBorderThickness(partial?.borderThickness),
    borderGlow: clampBorderGlow(partial?.borderGlow),
    surfaceBlur: clampSurfaceBlur(partial?.surfaceBlur),
  }
}

export function resolveFrameStyles(
  input?: Partial<Record<FrameKey, Partial<FrameStyle> | null>> | null,
  fallback?: Partial<FrameStyle> | null,
): FrameStyles {
  const base = defaultFrameStyle(fallback)
  return {
    hero: defaultFrameStyle({ ...base, ...(input?.hero ?? {}) }),
    tile: defaultFrameStyle({ ...base, ...(input?.tile ?? {}) }),
    card: defaultFrameStyle({ ...base, ...(input?.card ?? {}) }),
  }
}

export function storeFrameClass(key: FrameKey): string {
  return `store-frame store-frame-${key}`
}

/** Dark frames inherit each light piece until the owner customizes them. */
export function inheritFrameStyles(
  overlay: Partial<Record<FrameKey, Partial<FrameStyle> | null>> | null | undefined,
  base: FrameStyles,
): FrameStyles {
  return {
    hero: defaultFrameStyle({ ...base.hero, ...(overlay?.hero ?? {}) }),
    tile: defaultFrameStyle({ ...base.tile, ...(overlay?.tile ?? {}) }),
    card: defaultFrameStyle({ ...base.card, ...(overlay?.card ?? {}) }),
  }
}

/** How solid the glass fill is. 0 blur = opaque; higher blur lets the backdrop show. */
export function frameGlassPercent(blur: number): number {
  if (blur <= 0) return 100
  return Math.max(48, 100 - Math.round(blur * 1.35))
}

function norm(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed && HEX.test(trimmed) ? trimmed : undefined
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const mix = (color: string, pct: number, other: 'white' | 'black') =>
  `color-mix(in srgb, ${color} ${pct}%, ${other})`

export interface StorePalette {
  primaryColor?: string | null
  accentColor?: string | null
  backgroundColor?: string | null
  surfaceColor?: string | null
  textColor?: string | null
  mutedColor?: string | null
  borderColor?: string | null
  borderThickness?: number | null
  surfaceBlur?: number | null
  borderGlow?: number | null
  frameStyles?: Partial<Record<FrameKey, Partial<FrameStyle> | null>> | null
}

export function isDarkPalette(p: StorePalette): boolean {
  const reference = norm(p.backgroundColor) ?? norm(p.surfaceColor)
  return reference ? relativeLuminance(reference) < 0.4 : false
}

/** True when a hex color is dark enough that white/light text is required. */
export function isDarkHex(hex?: string | null): boolean {
  const color = norm(hex)
  return color ? relativeLuminance(color) < 0.45 : false
}

/**
 * Build the CSS-variable overrides for a palette. Keys are token variable
 * names. `forceDark` picks the dark brand-ramp direction even when the
 * palette itself has no dark background — used when only brand colors are
 * applied on top of the app's default dark theme.
 */
export function storeThemeVars(p: StorePalette, forceDark?: boolean): Record<string, string> {
  const vars: Record<string, string> = {}
  const bg = norm(p.backgroundColor)
  const surfaceExplicit = norm(p.surfaceColor)
  const dark = forceDark ?? isDarkPalette(p)

  const primary = norm(p.primaryColor)
  if (primary) {
    vars['--color-brand-500'] = primary
    vars['--store-glow'] = `color-mix(in srgb, ${primary} 14%, transparent)`
    vars['--store-glow-strong'] = `color-mix(in srgb, ${primary} ${dark ? 28 : 22}%, transparent)`
    vars['--ambient-brand'] = `color-mix(in srgb, ${primary} 16%, var(--color-bg))`
    if (dark) {
      // Dark theme: tints go darker, shades go lighter so on-surface text/pills stay legible.
      vars['--color-brand-50'] = mix(primary, 24, 'black')
      vars['--color-brand-100'] = mix(primary, 34, 'black')
      vars['--color-brand-200'] = mix(primary, 42, 'black')
      vars['--color-brand-300'] = mix(primary, 52, 'black')
      vars['--color-brand-400'] = mix(primary, 68, 'white')
      vars['--color-brand-600'] = mix(primary, 78, 'white')
      vars['--color-brand-700'] = mix(primary, 62, 'white')
    } else {
      vars['--color-brand-50'] = mix(primary, 12, 'white')
      vars['--color-brand-100'] = mix(primary, 22, 'white')
      vars['--color-brand-200'] = mix(primary, 38, 'white')
      vars['--color-brand-300'] = mix(primary, 55, 'white')
      vars['--color-brand-400'] = mix(primary, 72, 'white')
      vars['--color-brand-600'] = mix(primary, 85, 'black')
      vars['--color-brand-700'] = mix(primary, 72, 'black')
    }
  }

  const accent = norm(p.accentColor)
  if (accent) {
    vars['--color-accent-500'] = accent
    vars['--store-glow-accent'] = `color-mix(in srgb, ${accent} 18%, transparent)`
    vars['--ambient-accent'] = `color-mix(in srgb, ${accent} 6%, var(--color-bg))`
  }

  if (bg) vars['--color-bg'] = bg

  // Derive the neutral set whenever a theme intent exists (a background, an
  // explicit surface, or a dark reference), so partial palettes stay readable.
  if (bg || surfaceExplicit) {
    vars['--color-surface'] = surfaceExplicit ?? (dark && bg ? mix(bg, 86, 'white') : '#ffffff')
    vars['--color-fg'] = norm(p.textColor) ?? (dark ? '#f5f6fb' : '#0f172a')
    vars['--color-fg-muted'] = norm(p.mutedColor) ?? (dark ? '#aab0cb' : '#64748b')
    vars['--color-border'] = norm(p.borderColor) ?? (dark && bg ? mix(bg, 66, 'white') : '#e7e9ee')
  } else {
    // No background/surface intent: still honor any explicit neutral overrides.
    const surface = norm(p.surfaceColor)
    if (surface) vars['--color-surface'] = surface
    const text = norm(p.textColor)
    if (text) vars['--color-fg'] = text
    const muted = norm(p.mutedColor)
    if (muted) vars['--color-fg-muted'] = muted
    const border = norm(p.borderColor)
    if (border) vars['--color-border'] = border
  }

  const frames = resolveFrameStyles(p.frameStyles, {
    borderThickness: p.borderThickness ?? undefined,
    borderGlow: p.borderGlow ?? undefined,
    surfaceBlur: p.surfaceBlur ?? undefined,
  })
  vars['--store-border-width'] = `${frames.hero.borderThickness}px`
  vars['--store-blur'] = `${frames.hero.surfaceBlur}px`
  vars['--store-blur-strong'] = `${Math.round(frames.hero.surfaceBlur * 4 / 3)}px`
  vars['--store-border-glow'] = `${frames.hero.borderGlow}px`
  vars['--store-glass'] = `${frameGlassPercent(frames.hero.surfaceBlur)}%`
  for (const key of FRAME_KEYS) {
    vars[`--store-${key}-border-width`] = `${frames[key].borderThickness}px`
    vars[`--store-${key}-border-glow`] = `${frames[key].borderGlow}px`
    vars[`--store-${key}-blur`] = `${frames[key].surfaceBlur}px`
    vars[`--store-${key}-glass`] = `${frameGlassPercent(frames[key].surfaceBlur)}%`
  }

  return vars
}
