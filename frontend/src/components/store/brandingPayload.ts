import type { HeroLayout } from '../../api/types'
import type { PaletteKey } from './brandingTypes'
import { HEX } from './branding'
import type { StorePageBackgrounds } from '../../lib/pageBackgrounds'
import { resolvePageBackgrounds } from '../../lib/pageBackgrounds'
import { inheritFrameStyles, resolveFrameStyles, type FrameStyles } from '../../lib/storeTheme'
import { clampHeroImageOpacity, clampHeroImagePosition } from '../../lib/heroImageOpacity'

function sanitizePageBackgrounds(input?: StorePageBackgrounds | null): StorePageBackgrounds {
  const resolved = resolvePageBackgrounds(input)
  if (!resolved.colors) delete (resolved as Partial<StorePageBackgrounds>).colors
  return resolved
}

const PALETTE_KEYS: PaletteKey[] = [
  'primaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
  'mutedColor',
  'borderColor',
]

const URL_PATTERN = /^(https?:\/\/|\/)/

function normalizeHex(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (HEX.test(trimmed)) return trimmed.toLowerCase()
  return ''
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return URL_PATTERN.test(trimmed) ? trimmed : ''
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const URL_FIELD_KEYS = [
  'logoUrl',
  'heroImageUrl',
  'darkHeroImageUrl',
  'websiteUrl',
  'facebookUrl',
  'instagramUrl',
  'twitterUrl',
  'discordUrl',
] as const

export interface BrandingPayloadInput {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  borderThickness?: number
  surfaceBlur?: number
  borderGlow?: number
  frameStyles?: FrameStyles
  darkFrameStyles?: FrameStyles | null
  pageBackgrounds?: StorePageBackgrounds
  darkColors: Record<PaletteKey, string>
  contactEmail: string
  logoUrl?: string
  heroImageUrl?: string
  darkHeroImageUrl?: string
  heroImageOpacity?: number
  darkHeroImageOpacity?: number | null
  heroImagePosition?: number
  heroImagePositionX?: number
  darkHeroImagePosition?: number | null
  darkHeroImagePositionX?: number | null
  heroImagePositionMobileX?: number | null
  heroImagePositionMobileY?: number | null
  websiteUrl?: string
  facebookUrl?: string
  instagramUrl?: string
  twitterUrl?: string
  discordUrl?: string
}

export interface HeroBrandingPayload {
  logoUrl: string
  heroImageUrl: string
  darkHeroImageUrl: string
  heroImageOpacity: number
  darkHeroImageOpacity: number | null
  heroImagePosition: number
  heroImagePositionX: number
  darkHeroImagePosition: number | null
  darkHeroImagePositionX: number | null
  heroImagePositionMobileX: number | null
  heroImagePositionMobileY: number | null
  heroHeading: string
  heroSubheading: string
  tagline: string
  heroLayout: HeroLayout
}

/** Strip invalid hex / email / URLs so PATCH validation does not reject the whole form. */
export function sanitizeBrandingPayload<T extends BrandingPayloadInput>(form: T): T {
  const next = { ...form }

  for (const key of PALETTE_KEYS) {
    next[key] = normalizeHex(form[key])
  }

  const dark = { ...form.darkColors }
  for (const key of PALETTE_KEYS) {
    dark[key] = normalizeHex(dark[key] ?? '')
  }
  next.darkColors = dark

  next.frameStyles = resolveFrameStyles(form.frameStyles, {
    borderThickness: form.borderThickness,
    borderGlow: form.borderGlow,
    surfaceBlur: form.surfaceBlur,
  })
  next.borderThickness = next.frameStyles.hero.borderThickness
  next.surfaceBlur = next.frameStyles.hero.surfaceBlur
  next.borderGlow = next.frameStyles.hero.borderGlow
  if (form.darkFrameStyles) {
    next.darkFrameStyles = inheritFrameStyles(form.darkFrameStyles, next.frameStyles)
  } else {
    delete (next as Partial<BrandingPayloadInput>).darkFrameStyles
  }

  next.pageBackgrounds = sanitizePageBackgrounds(form.pageBackgrounds)
  next.heroImageOpacity = clampHeroImageOpacity(form.heroImageOpacity)
  next.darkHeroImageOpacity = clampHeroImageOpacity(form.darkHeroImageOpacity)
  next.heroImagePosition = clampHeroImagePosition(form.heroImagePosition)
  next.heroImagePositionX = clampHeroImagePosition(form.heroImagePositionX)
  next.darkHeroImagePosition = clampHeroImagePosition(form.darkHeroImagePosition)
  next.darkHeroImagePositionX = clampHeroImagePosition(form.darkHeroImagePositionX)
  next.heroImagePositionMobileX = clampHeroImagePosition(form.heroImagePositionMobileX)
  next.heroImagePositionMobileY = clampHeroImagePosition(form.heroImagePositionMobileY)

  const email = form.contactEmail.trim()
  next.contactEmail = email && EMAIL.test(email) ? email : ''

  for (const key of URL_FIELD_KEYS) {
    const raw = form[key]
    if (typeof raw === 'string') {
      next[key] = normalizeUrl(raw)
    }
  }

  return next
}

export function pickHeroBrandingPayload(form: HeroBrandingPayload): HeroBrandingPayload {
  return {
    logoUrl: normalizeUrl(form.logoUrl),
    heroImageUrl: normalizeUrl(form.heroImageUrl),
    darkHeroImageUrl: normalizeUrl(form.darkHeroImageUrl),
    heroImageOpacity: clampHeroImageOpacity(form.heroImageOpacity),
    darkHeroImageOpacity: form.darkHeroImageOpacity == null
      ? null
      : clampHeroImageOpacity(form.darkHeroImageOpacity),
    heroImagePosition: clampHeroImagePosition(form.heroImagePosition),
    heroImagePositionX: clampHeroImagePosition(form.heroImagePositionX),
    darkHeroImagePosition: form.darkHeroImagePosition == null
      ? null
      : clampHeroImagePosition(form.darkHeroImagePosition),
    darkHeroImagePositionX: form.darkHeroImagePositionX == null
      ? null
      : clampHeroImagePosition(form.darkHeroImagePositionX),
    heroImagePositionMobileX: form.heroImagePositionMobileX == null
      ? null
      : clampHeroImagePosition(form.heroImagePositionMobileX),
    heroImagePositionMobileY: form.heroImagePositionMobileY == null
      ? null
      : clampHeroImagePosition(form.heroImagePositionMobileY),
    heroHeading: form.heroHeading.trim(),
    heroSubheading: form.heroSubheading.trim(),
    tagline: form.tagline.trim(),
    heroLayout: form.heroLayout,
  }
}
