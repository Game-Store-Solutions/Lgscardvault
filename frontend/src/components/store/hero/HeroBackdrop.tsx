import { cx } from '../../../lib/cx'
import { heroImageOpacityCss } from '../../../lib/heroImageOpacity'
import { layoutUsesHeroPhotoBackground } from './heroLayouts'

export { layoutUsesHeroPhotoBackground } from './heroLayouts'

export function HeroPhotoBackgroundLayer({
  heroImageUrl,
  hasImage,
  primary,
  scrim = 'dark',
  imageClassName,
  imageOpacity = 100,
  blur = false,
}: {
  heroImageUrl?: string | null
  hasImage: boolean
  primary: string
  scrim?: 'dark' | 'token' | 'light' | 'none'
  imageClassName?: string
  /** Photo strength 0–100. */
  imageOpacity?: number
  blur?: boolean
}) {
  if (!hasImage || !heroImageUrl?.trim()) {
    return <div aria-hidden className="absolute inset-0 -z-20" style={{ backgroundColor: primary }} />
  }

  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-[21] bg-bg" />
      <img
        src={heroImageUrl}
        alt=""
        aria-hidden
        className={cx(
          'absolute inset-0 -z-20 size-full object-cover',
          blur && 'scale-105 blur-md',
          imageClassName,
        )}
        style={{ opacity: heroImageOpacityCss(imageOpacity) }}
      />
      {scrim === 'none' ? null : scrim === 'token' ? (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-br from-bg/94 via-surface/90 to-bg/88"
        />
      ) : scrim === 'light' ? (
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-white/88 via-surface/82 to-bg/90" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-br from-black/75 via-black/50 to-black/65"
        />
      )}
    </>
  )
}

/** Optional full-bleed hero photo when the layout supports it. */
export function HeroOptionalPhoto({
  layout,
  heroImageUrl,
  hasImage,
  primary,
  scrim = 'dark',
  imageOpacity = 100,
}: {
  layout?: import('../../../api/types').HeroLayout | null
  heroImageUrl?: string | null
  hasImage: boolean
  primary: string
  scrim?: 'dark' | 'token' | 'light' | 'none'
  imageOpacity?: number
}) {
  if (!layoutUsesHeroPhotoBackground(layout)) return null
  return (
    <HeroPhotoBackgroundLayer
      heroImageUrl={heroImageUrl}
      hasImage={hasImage}
      primary={primary}
      scrim={scrim}
      imageOpacity={imageOpacity}
    />
  )
}
