import type { ReactNode } from 'react'
import { Store as StoreIcon } from 'lucide-react'
import type { HeroLayout } from '../../api/types'
import { cx } from '../../lib/cx'
import { isDarkHex } from '../../lib/storeTheme'
import { normalizeHeroLayout } from './hero/heroLayouts'
import { SignatureHeroLayout } from './hero/HeroSignatureLayouts'

export const DEFAULT_PRIMARY = '#0a1627'
export const DEFAULT_ACCENT = '#c6a035'

export type { HeroLayout }

export interface StoreHeroStats {
  listings: number
  cards: number
  sets: number
}

export interface StoreHeroProps {
  name: string
  tagline?: string | null
  heroHeading?: string | null
  heroSubheading?: string | null
  heroImageUrl?: string | null
  /** Banner photo opacity 0–100 for the current color mode. */
  heroImageOpacity?: number | null
  /** Vertical crop 0–100 for the current color mode (0 = top, 100 = bottom). */
  heroImagePosition?: number | null
  /** Horizontal crop 0–100 for the current color mode (0 = left, 100 = right). */
  heroImagePositionX?: number | null
  /** Phone horizontal crop. Null = inherit desktop. */
  heroImagePositionMobileX?: number | null
  /** Phone vertical crop. Null = inherit desktop. */
  heroImagePositionMobileY?: number | null
  /** When true, apply the phone crop in this render (preview or narrow viewport). */
  phoneCrop?: boolean
  logoUrl?: string | null
  primaryColor?: string | null
  accentColor?: string | null
  layout?: HeroLayout | null
  slug?: string
  locationLabel?: string | null
  verified?: boolean
  stats?: StoreHeroStats
  showcaseCards?: import('./hero/heroCardPool').HeroCardImage[]
  communityEvents?: import('../../api/types').StoreCommunityEvents | null
  actions?: ReactNode
  className?: string
}

export function useHeroTokens(props: StoreHeroProps) {
  const primary = props.primaryColor?.trim() || DEFAULT_PRIMARY
  const accent = props.accentColor?.trim() || DEFAULT_ACCENT
  const heading = props.heroHeading?.trim() || props.name
  const hasImage = Boolean(props.heroImageUrl?.trim())
  return { primary, accent, heading, hasImage }
}

export function HeroLogo({
  logoUrl,
  className,
  glass,
}: {
  logoUrl?: string | null
  className?: string
  glass?: boolean
}) {
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center overflow-hidden rounded-btn border',
        glass ? 'border-white/25 bg-white/10 backdrop-blur' : 'border-border bg-surface',
        className,
      )}
    >
      {logoUrl?.trim() ? (
        <img src={logoUrl} alt="" width={56} height={56} className="size-full object-cover" />
      ) : (
        <StoreIcon aria-hidden className={cx('size-6', glass ? 'text-white' : 'text-fg-muted')} />
      )}
    </span>
  )
}

export function HeroTagline({ tagline, accent, light }: { tagline: string; accent: string; light?: boolean }) {
  const accentIsDark = isDarkHex(accent)
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] shadow-sm',
        light || accentIsDark ? 'text-white' : 'text-fg',
      )}
      style={{ backgroundColor: accent }}
    >
      <span className="truncate">{tagline}</span>
    </span>
  )
}

/** Storefront hero — signature LGS layout library. */
export function StoreHero(props: StoreHeroProps) {
  const layout = normalizeHeroLayout(props.layout ?? 'cinematic')
  const tokens = useHeroTokens(props)
  return <SignatureHeroLayout layout={layout} props={props} tokens={tokens} />
}

export default StoreHero
