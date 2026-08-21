export function readCssVar(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  return value || fallback
}

/** Canvas fill from a CSS color string (hex or rgb/rgba). */
export function cssColorToRgba(color: string, alpha: number): string {
  const trimmed = color.trim()
  const hex = trimmed.match(/^#([0-9a-fA-F]{6})$/)
  if (hex) {
    const normalized = hex[1]
    const r = parseInt(normalized.slice(0, 2), 16)
    const g = parseInt(normalized.slice(2, 4), 16)
    const b = parseInt(normalized.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  }

  return `rgba(109, 94, 252, ${alpha})`
}
