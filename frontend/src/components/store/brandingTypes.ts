/** Shared branding palette types (no UI imports). */
export const PALETTE_DEFAULTS = {
  primaryColor: '#6d5efc',
  accentColor: '#ff7a59',
  backgroundColor: '#f7f8fa',
  surfaceColor: '#ffffff',
  textColor: '#0f172a',
  mutedColor: '#64748b',
  borderColor: '#e7e9ee',
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
