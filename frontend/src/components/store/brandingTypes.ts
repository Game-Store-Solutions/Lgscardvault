/** Shared branding palette types (no UI imports). */
export const PALETTE_DEFAULTS = {
  primaryColor: '#0a1627',
  accentColor: '#c6a035',
  backgroundColor: '#f3f4f6',
  surfaceColor: '#ffffff',
  textColor: '#0a0a0b',
  mutedColor: '#6b7280',
  borderColor: 'rgb(10 10 11 / 0.08)',
} as const

export type PaletteKey = keyof typeof PALETTE_DEFAULTS
export type Palette = Record<PaletteKey, string>

export interface ThemePreset {
  id?: string
  name: string
  description?: string
  palette: Palette
  darkPalette?: Partial<Palette>
}
