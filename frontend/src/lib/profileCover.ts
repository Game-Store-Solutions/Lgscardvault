export const PROFILE_COVER_PRESETS = [
  { id: 'default', label: 'Default', color: null },
  { id: 'navy', label: 'Navy', color: '#0a1627' },
  { id: 'crimson', label: 'Crimson', color: '#dc2626' },
  { id: 'gold', label: 'Gold', color: '#c6a035' },
  { id: 'slate', label: 'Slate', color: '#475569' },
  { id: 'forest', label: 'Forest', color: '#166534' },
  { id: 'indigo', label: 'Indigo', color: '#4338ca' },
  { id: 'rose', label: 'Rose', color: '#be123c' },
] as const

const HEX = /^#[0-9a-fA-F]{6}$/

/** Empty or invalid input becomes null (the theme default). */
export function normalizeCoverColor(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const hex = value.startsWith('#') ? value : `#${value}`
  return HEX.test(hex) ? hex.toLowerCase() : null
}
