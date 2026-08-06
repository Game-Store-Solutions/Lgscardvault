import type { HeroLayout } from '../../api/types'
import type { PaletteKey } from './brandingTypes'
import { HEX } from './branding'

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
  darkColors: Record<PaletteKey, string>
  contactEmail: string
  logoUrl?: string
  heroImageUrl?: string
  websiteUrl?: string
  facebookUrl?: string
  instagramUrl?: string
  twitterUrl?: string
  discordUrl?: string
}

export interface HeroBrandingPayload {
  logoUrl: string
  heroImageUrl: string
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
    heroHeading: form.heroHeading.trim(),
    heroSubheading: form.heroSubheading.trim(),
    tagline: form.tagline.trim(),
    heroLayout: form.heroLayout,
  }
}
