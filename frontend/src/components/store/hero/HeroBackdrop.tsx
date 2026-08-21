import { cx } from '../../../lib/cx'
import { heroImageOpacityCss } from '../../../lib/heroImageOpacity'
import { layoutUsesHeroPhotoBackground } from './heroLayouts'

export { layoutUsesHeroPhotoBackground } from './heroLayouts'

export function HeroPhotoBackgroundLayer({
  heroImageUrl,
  hasImage,
  primary,
  imageClassName,
  imageOpacity = 100,
  blur = false,
}: {
  heroImageUrl?: string | null
  hasImage: boolean
  primary: string
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
    </>
  )
}

/** Optional full-bleed hero photo when the layout supports it. */
export function HeroOptionalPhoto({
  layout,
  heroImageUrl,
  hasImage,
  primary,
  imageOpacity = 100,
}: {
  layout?: import('../../../api/types').HeroLayout | null
  heroImageUrl?: string | null
  hasImage: boolean
  primary: string
  imageOpacity?: number
}) {
  if (!layoutUsesHeroPhotoBackground(layout)) return null
  return (
    <HeroPhotoBackgroundLayer
      heroImageUrl={heroImageUrl}
      hasImage={hasImage}
      primary={primary}
      imageOpacity={imageOpacity}
    />
  )
}
