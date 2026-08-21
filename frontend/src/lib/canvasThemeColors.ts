export function readCssVar(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  return value || fallback
}

/** Resolve pattern + brand colors from the nearest themed ancestor. */
export function readPatternColors(host: HTMLElement): {
  primary: string
  secondary: string
  base: string
} {
  let patternRoot: HTMLElement | null = host
  while (patternRoot && !getComputedStyle(patternRoot).getPropertyValue('--page-bg-pattern-primary').trim()) {
    patternRoot = patternRoot.parentElement
  }
  const themeRoot = (host.closest('.store-theme') as HTMLElement | null) ?? patternRoot ?? host
  const readFrom = patternRoot ?? themeRoot

  return {
    primary: readCssVar(
      readFrom,
      '--page-bg-pattern-primary',
      readCssVar(themeRoot, '--color-brand-500', '#0a1627'),
    ),
    secondary: readCssVar(
      readFrom,
      '--page-bg-pattern-secondary',
      readCssVar(themeRoot, '--color-accent-500', '#c6a035'),
    ),
    base: readCssVar(readFrom, '--page-bg-pattern-base', ''),
  }
}

/** Canvas fill from a CSS color string (hex, rgb/rgba, or browser-normalized values). */
export function cssColorToRgba(color: string, alpha: number): string {
  const trimmed = color.trim()
  if (!trimmed) return `rgba(10, 22, 39, ${alpha})`

  const hex6 = trimmed.match(/^#([0-9a-fA-F]{6})$/)
  if (hex6) {
    const normalized = hex6[1]
    const r = parseInt(normalized.slice(0, 2), 16)
    const g = parseInt(normalized.slice(2, 4), 16)
    const b = parseInt(normalized.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const hex3 = trimmed.match(/^#([0-9a-fA-F]{3})$/)
  if (hex3) {
    const [r, g, b] = hex3[1].split('')
    return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`
  }

  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  }

  if (typeof document !== 'undefined') {
    const probe = document.createElement('canvas').getContext('2d')
    if (probe) {
      probe.fillStyle = trimmed
      const normalized = probe.fillStyle
      if (typeof normalized === 'string' && normalized !== trimmed) {
        return cssColorToRgba(normalized, alpha)
      }
    }
  }

  return `rgba(10, 22, 39, ${alpha})`
}
