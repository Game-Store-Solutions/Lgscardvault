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
}

export function isDarkPalette(p: StorePalette): boolean {
  const reference = norm(p.backgroundColor) ?? norm(p.surfaceColor)
  return reference ? relativeLuminance(reference) < 0.4 : false
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
    if (dark) {
      // Dark theme: tints go darker, shades go lighter so on-surface text/pills stay legible.
      vars['--color-brand-50'] = mix(primary, 24, 'black')
      vars['--color-brand-100'] = mix(primary, 34, 'black')
      vars['--color-brand-300'] = mix(primary, 52, 'black')
      vars['--color-brand-600'] = mix(primary, 78, 'white')
      vars['--color-brand-700'] = mix(primary, 62, 'white')
    } else {
      vars['--color-brand-50'] = mix(primary, 12, 'white')
      vars['--color-brand-100'] = mix(primary, 22, 'white')
      vars['--color-brand-300'] = mix(primary, 55, 'white')
      vars['--color-brand-600'] = mix(primary, 85, 'black')
      vars['--color-brand-700'] = mix(primary, 72, 'black')
    }
  }

  const accent = norm(p.accentColor)
  if (accent) vars['--color-accent-500'] = accent

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

  return vars
}
