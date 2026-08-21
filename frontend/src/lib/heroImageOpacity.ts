/** Hero banner photo strength (0–100). 100 is fully opaque (current default). */
export const HERO_IMAGE_OPACITY_DEFAULT = 100

export const HERO_IMAGE_OPACITY_RANGE = { min: 0, max: 100 } as const

/** Vertical crop (0 = top, 50 = center, 100 = bottom). */
export const HERO_IMAGE_POSITION_DEFAULT = 50

export const HERO_IMAGE_POSITION_RANGE = { min: 0, max: 100 } as const

export function clampHeroImageOpacity(value: unknown, fallback = HERO_IMAGE_OPACITY_DEFAULT): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(HERO_IMAGE_OPACITY_RANGE.max, Math.max(HERO_IMAGE_OPACITY_RANGE.min, Math.round(n)))
}

export function clampHeroImagePosition(value: unknown, fallback = HERO_IMAGE_POSITION_DEFAULT): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(HERO_IMAGE_POSITION_RANGE.max, Math.max(HERO_IMAGE_POSITION_RANGE.min, Math.round(n)))
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

/** Pick light or dark vertical crop. Unset dark inherits light. */
export function resolveHeroImagePosition(
  light?: number | null,
  dark?: number | null,
  isDark = false,
): number {
  const lightValue = clampHeroImagePosition(light)
  if (!isDark || dark == null) return lightValue
  return clampHeroImagePosition(dark)
}

/** Use the dark banner photo when set; otherwise the light photo. */
export function resolveHeroImageUrl(
  light?: string | null,
  dark?: string | null,
  isDark = false,
): string {
  const lightUrl = light?.trim() ?? ''
  const darkUrl = dark?.trim() ?? ''
  if (isDark && darkUrl) return darkUrl
  return lightUrl
}

/** CSS `opacity` (0–1) for the hero background `<img>`. */
export function heroImageOpacityCss(percent: number): number {
  return clampHeroImageOpacity(percent) / 100
}

export const HERO_BANNER_PHOTO_CLASS = 'hero-banner-photo'

/** CSS crop variables: desktop X/Y, with optional phone overrides below 640px. */
export function heroImageCropVars(
  x: number,
  y: number,
  mobileX?: number | null,
  mobileY?: number | null,
): Record<string, string> {
  const posX = clampHeroImagePosition(x)
  const posY = clampHeroImagePosition(y)
  return {
    '--hero-image-pos-x': `${posX}%`,
    '--hero-image-pos-y': `${posY}%`,
    '--hero-image-pos-mobile-x': `${clampHeroImagePosition(mobileX, posX)}%`,
    '--hero-image-pos-mobile-y': `${clampHeroImagePosition(mobileY, posY)}%`,
  }
}

/** Combined opacity + crop for the hero `<img>`. `phoneCrop` uses the phone focal point. */
export function heroImagePhotoStyle(
  opacity: number,
  x: number,
  y: number,
  mobileX?: number | null,
  mobileY?: number | null,
  phoneCrop = false,
): Record<string, string | number> {
  const desktopX = clampHeroImagePosition(x)
  const desktopY = clampHeroImagePosition(y)
  const posX = phoneCrop ? clampHeroImagePosition(mobileX, desktopX) : desktopX
  const posY = phoneCrop ? clampHeroImagePosition(mobileY, desktopY) : desktopY
  return {
    opacity: heroImageOpacityCss(opacity),
    objectFit: 'cover',
    objectPosition: `${posX}% ${posY}%`,
  }
}

