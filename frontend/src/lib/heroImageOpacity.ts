/** Hero banner photo strength (0–100). 100 is fully opaque (current default). */
export const HERO_IMAGE_OPACITY_DEFAULT = 100

export const HERO_IMAGE_OPACITY_RANGE = { min: 0, max: 100 } as const

export function clampHeroImageOpacity(value: unknown, fallback = HERO_IMAGE_OPACITY_DEFAULT): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(HERO_IMAGE_OPACITY_RANGE.max, Math.max(HERO_IMAGE_OPACITY_RANGE.min, Math.round(n)))
}

/** Pick light or dark hero photo opacity. Unset dark inherits light. */
export function resolveHeroImageOpacity(
  light?: number | null,
  dark?: number | null,
  isDark = false,
): number {
  const lightValue = clampHeroImageOpacity(light)
  if (!isDark || dark == null) return lightValue
  return clampHeroImageOpacity(dark)
}

/** CSS `opacity` (0–1) for the hero background `<img>`. */
export function heroImageOpacityCss(percent: number): number {
  return clampHeroImageOpacity(percent) / 100
}
